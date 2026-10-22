// Every stylesheet of the till, in cascade order: the fonts, the tokens, then the controls
// and the screens built from them. The app and the layout test page both import this.
// The fonts ship inside the app (a till must look right offline), and only the subsets a
// Vietnamese menu needs: Fraunces for product names and big sums, Plus Jakarta Sans for the rest.
// Fraunces with its optical size axis, so a 15px name and a 32px sum each get their own cut.
import "@fontsource-variable/fraunces/opsz.css";
import "@fontsource/plus-jakarta-sans/vietnamese-400.css";
import "@fontsource/plus-jakarta-sans/latin-ext-400.css";
import "@fontsource/plus-jakarta-sans/latin-400.css";
import "@fontsource/plus-jakarta-sans/vietnamese-500.css";
import "@fontsource/plus-jakarta-sans/latin-ext-500.css";
import "@fontsource/plus-jakarta-sans/latin-500.css";
import "@fontsource/plus-jakarta-sans/vietnamese-600.css";
import "@fontsource/plus-jakarta-sans/latin-ext-600.css";
import "@fontsource/plus-jakarta-sans/latin-600.css";
import "@fontsource/plus-jakarta-sans/vietnamese-700.css";
import "@fontsource/plus-jakarta-sans/latin-ext-700.css";
import "@fontsource/plus-jakarta-sans/latin-700.css";
import "./pos-tokens.css";
import "./pos-base.css";
import "./pos-controls.css";
import "./pos-kbd.css";
import "./pos-surfaces.css";
import "./pos-shell.css";
import "./pos-nav.css";
import "./pos-screens.css";
import "./pos-category-tones.css";
import "./pos-sale.css";
import "./pos-product-tiles.css";
import "./pos-product-photos.css";
import "./pos-category-rail.css";
import "./pos-order.css";
import "./pos-cart-line.css";
import "./pos-cart-totals.css";
import "./pos-cart-controls.css";
import "./pos-picker.css";
import "./pos-chips.css";
import "./pos-note-counter.css";
import "./pos-payment.css";
import "./pos-keypad.css";
import "./pos-qr.css";
import "./pos-checkout.css";
import "./pos-drawer.css";
import "./pos-pay-drawer.css";
import "./pos-floor.css";
import "./pos-table-tile.css";
import "./pos-floor-plan.css";
import "./pos-operations.css";
