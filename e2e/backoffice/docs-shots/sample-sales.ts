import { newId } from "@fnb/db";
import { DOMAIN_VERSION, businessDate } from "@fnb/domain";
import { expectedAmountDue } from "../../pos/support/expected-amount-due";
import type { SampleShopStack } from "./sample-shop-stack";

interface ProductDocument {
  basePrice: number | null;
  variants: { id: string; price: number | null }[];
  modifierGroups: {
    id: string;
    minSelect: number;
    options: { id: string; priceDelta: number }[];
  }[];
}

/** What the café sells in the pictures: product name and how many cups of it in one order. */
const ORDERS: readonly (readonly [string, number])[] = [
  ["Cà phê sữa đá", 2],
  ["Bạc xỉu", 1],
  ["Trà đào cam sả", 1],
  ["Cà phê sữa đá", 1],
  ["Trà sữa trân châu", 2],
  ["Cà phê đen đá", 1],
  ["Latte", 1],
  ["Cà phê muối", 1],
  ["Trà vải", 1],
  ["Cà phê sữa đá", 1],
  ["Bạc xỉu", 2],
  ["Americano", 1],
];

async function call(
  stack: SampleShopStack,
  method: string,
  path: string,
  headers: Record<string, string>,
  body?: unknown,
) {
  const response = await fetch(`${stack.apiOrigin}${path}`, {
    method,
    headers: { ...headers, ...(body === undefined ? {} : { "content-type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const answer = (await response.json().catch(() => null)) as Record<string, unknown>;
  if (response.status >= 300)
    throw new Error(`${method} ${path} answered ${response.status}: ${JSON.stringify(answer)}`);
  return answer;
}

/**
 * A till paired with the seeded code, the seeded cashier signed in, a shift opened and a
 * dozen takeaway orders paid in cash, each line the size the menu lists first and the first
 * option of every required group: the day the home page and the daily report show.
 */
export async function sellSampleDay(stack: SampleShopStack): Promise<void> {
  const owner = { cookie: stack.ownerCookie };
  const paired = await call(
    stack,
    "POST",
    "/devices/pair",
    {},
    { code: stack.shop.pairingCode.code, deviceName: "Quầy 1" },
  );
  const device = { authorization: `Device ${String(paired.deviceToken)}` };
  const { staff } = (await call(stack, "GET", "/staff", owner)) as unknown as {
    staff: { id: string; displayName: string }[];
  };
  const cashier = stack.shop.staff.find((member) => member.roleName === "Thu ngân");
  const staffId = staff.find((member) => member.displayName === cashier?.displayName)?.id ?? "";
  const session = await call(stack, "POST", "/pos/staff-sessions", device, {
    staffId,
    pin: cashier?.pin,
  });
  const till = { ...device, "x-staff-session": String(session.staffSessionToken) };

  const listed = (await call(
    stack,
    "GET",
    `/catalog/products?brandId=${stack.shop.brandId}`,
    owner,
  )) as unknown as {
    id: string;
    name: string;
  }[];
  const commands: { type: string; payload: unknown }[] = [
    {
      type: "shift.open",
      payload: {
        shiftId: newId(),
        openingCash: 500_000,
        denominations: [{ denomination: 500_000, pieces: 1 }],
      },
    },
  ];
  for (const [index, [name, cups]] of ORDERS.entries()) {
    const productId = listed.find((product) => product.name === name)?.id ?? "";
    const document = (await call(
      stack,
      "GET",
      `/catalog/products/${productId}`,
      owner,
    )) as unknown as ProductDocument;
    const variant = document.variants[0] ?? null;
    const chosen = document.modifierGroups
      .filter((group) => group.minSelect > 0)
      .map((group) => ({ group, option: group.options[0] }));
    const modifiers = chosen.map(({ group, option }) => ({
      groupId: group.id,
      optionId: option?.id ?? "",
      quantity: 1,
    }));
    const unitPrice = variant?.price ?? document.basePrice ?? 0;
    const orderId = newId();
    const line = {
      lineId: newId(),
      productId,
      variantId: variant?.id ?? null,
      modifiers,
      quantity: String(cups),
      note: null,
    };
    const amount = Number(
      expectedAmountDue([
        { unitPrice, quantity: cups },
        ...chosen.map(({ option }) => ({
          unitPrice: option?.priceDelta ?? 0,
          quantity: 1,
          option: true as const,
        })),
      ]),
    );
    commands.push(
      {
        type: "order.save_draft",
        payload: {
          orderId,
          deviceOrderNo: index + 1,
          serviceType: "takeaway",
          channelKey: null,
          lines: [line],
        },
      },
      {
        type: "order.pay",
        payload: { orderId, payments: [{ method: "cash", amount }], expectedAmountDue: amount },
      },
    );
  }
  const today = businessDate(Date.now(), { utcOffsetMinutes: 420, dayStartMinute: 240 });
  const pushed = await call(stack, "POST", "/sync/commands", till, {
    commands: commands.map((command, index) => ({
      commandId: newId(),
      deviceSeq: index + 1,
      type: command.type,
      payload: command.payload,
      businessDate: today,
      domainVersion: DOMAIN_VERSION,
      createdAt: new Date().toISOString(),
    })),
  });
  const refused = (pushed.results as { status: string; code?: string }[]).filter(
    (result) => result.status !== "accepted",
  );
  if (refused.length > 0)
    throw new Error(`the sample sales were refused: ${JSON.stringify(refused)}`);
}
