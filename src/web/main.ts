import { mount } from "svelte";
import App from "./App.svelte";
import { applyTheme } from "./settings.svelte";
import { installNumberWheel } from "./numberwheel";
import "./style.css";

// The print view is always light; the editor follows the setting.
if (!(window as { __FERRULE_PRINT__?: unknown }).__FERRULE_PRINT__) applyTheme();
installNumberWheel();
mount(App, { target: document.getElementById("app")! });
