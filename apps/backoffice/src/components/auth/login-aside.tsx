import { CircleCheck } from "lucide-react";
import { vi } from "../../messages/vi";
import { Icon } from "../ui/icon";

const T = vi.login;

/** What the backoffice is for, beside the sign-in form on a computer; left out on a phone. */
export function LoginAside() {
  return (
    <aside className="bo-login-aside" aria-labelledby="login-aside-title">
      <h2 id="login-aside-title" className="bo-login-aside__title">
        {T.asideTitle}
      </h2>
      <ul className="bo-login-aside__points">
        {T.asidePoints.map((point) => (
          <li key={point}>
            <Icon of={CircleCheck} size={20} />
            <span>{point}</span>
          </li>
        ))}
      </ul>
    </aside>
  );
}
