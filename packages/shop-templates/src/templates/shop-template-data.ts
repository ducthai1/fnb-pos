import type { ShopTemplate } from "../shop-template-types";

/*
 * Starting points by kind of shop. The switches follow the catalog's own rules (course
 * firing needs the floor plan) and the way each kind sells: a counter that takes payment
 * first, or tables that run a tab until the end.
 */

export const CAFE: ShopTemplate = {
  id: "cafe",
  name: "Cà phê",
  description: "Gọi và trả tiền ở quầy, một quầy pha chế, tem dán ly.",
  categories: ["Cà phê", "Trà", "Nước ép và sinh tố", "Bánh ngọt", "Đồ ăn nhẹ"],
  stations: ["Bar"],
  flags: { pay_first_counter: true, kitchen_routing: true, cup_labels: true, tables: false },
};

export const MILK_TEA: ShopTemplate = {
  id: "milk_tea",
  name: "Trà sữa",
  description: "Gọi và trả tiền trước ở quầy, một quầy pha chế, tem dán ly, không có bàn.",
  categories: ["Trà sữa", "Trà trái cây", "Cà phê", "Đá xay", "Topping"],
  stations: ["Bar"],
  flags: { pay_first_counter: true, kitchen_routing: true, cup_labels: true, tables: false },
};

export const RESTAURANT: ShopTemplate = {
  id: "restaurant",
  name: "Quán ăn",
  description: "Khách ngồi bàn, gọi nhiều lượt và trả tiền cuối bữa; bếp chia nhiều trạm, ra món theo lượt.",
  categories: ["Khai vị", "Món chính", "Món nước", "Cơm", "Tráng miệng", "Đồ uống"],
  stations: ["Bếp nóng", "Bếp lạnh", "Bar nước"],
  flags: { tables: true, pay_first_counter: false, course_firing: true, kitchen_routing: true, cup_labels: false },
};

export const BAR: ShopTemplate = {
  id: "bar",
  name: "Quán bar",
  description: "Khách ngồi bàn hoặc quầy và mở tab trả sau; quầy bar và bếp nhỏ.",
  categories: ["Bia", "Cocktail", "Rượu mạnh", "Nước giải khát", "Đồ nhắm"],
  stations: ["Quầy bar", "Bếp"],
  flags: { tables: true, pay_first_counter: false, kitchen_routing: true, cup_labels: false },
};

export const BAKERY: ShopTemplate = {
  id: "bakery",
  name: "Tiệm bánh",
  description: "Chọn và trả tiền ở quầy, không có bàn; quầy bánh và quầy nước.",
  categories: ["Bánh mì", "Bánh ngọt", "Bánh kem", "Đồ uống"],
  stations: ["Quầy bánh", "Quầy nước"],
  flags: { pay_first_counter: true, kitchen_routing: true, cup_labels: false, tables: false },
};
