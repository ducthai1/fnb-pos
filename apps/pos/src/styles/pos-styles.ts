// Every stylesheet of the till, in cascade order: the fonts, the tokens, then the controls
// and the screens built from them. The app and the layout test page both import this.
// The font ships inside the app (a till must look right offline), and only the subsets a
// Vietnamese menu needs. One sans family for everything: product names, big sums and the
// order number stand out by weight and size (600-800), not by a second typeface.
import "@fontsource/be-vietnam-pro/vietnamese-400.css";
import "@fontsource/be-vietnam-pro/latin-400.css";
import "@fontsource/be-vietnam-pro/vietnamese-500.css";
import "@fontsource/be-vietnam-pro/latin-500.css";
import "@fontsource/be-vietnam-pro/vietnamese-600.css";
import "@fontsource/be-vietnam-pro/latin-600.css";
import "@fontsource/be-vietnam-pro/vietnamese-700.css";
import "@fontsource/be-vietnam-pro/latin-700.css";
import "@fontsource/be-vietnam-pro/vietnamese-800.css";
import "@fontsource/be-vietnam-pro/latin-800.css";
import "./pos-tokens.css";
import "./pos-base.css";
import "./pos-controls.css";
import "./pos-kbd.css";
import "./pos-surfaces.css";
import "./pos-shell.css";
import "./pos-nav.css";
import "./pos-theme-menu.css";
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
import "./pos-combo-picker.css";
import "./pos-note-counter.css";
import "./pos-payment.css";
import "./pos-keypad.css";
import "./pos-qr.css";
import "./pos-checkout.css";
import "./pos-drawer.css";
import "./pos-pay-drawer.css";
import "./pos-line-entry.css";
import "./pos-floor.css";
import "./pos-table-tile.css";
import "./pos-floor-plan.css";
import "./pos-operations.css";
import "./pos-motion.css";
