import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";

import { errorText, isAppError } from "../lib/errors";
import { useSettings } from "./useSettings";
import { type ToastAction, useToasts } from "./useToasts";

function beep(ok: boolean) {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = ok ? 880 : 220;
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.25);
    osc.onended = () => void ctx.close();
  } catch {
    // Audio is optional.
  }
}

async function notify(title: string, body: string) {
  try {
    let granted = await isPermissionGranted();
    if (!granted) granted = (await requestPermission()) === "granted";
    if (granted) sendNotification({ title, body });
  } catch {
    // Notifications are optional.
  }
}

/** Reports the end of a user action: toast always, sound and notification per settings. */
export function useFeedback() {
  const { t } = useTranslation();
  const settings = useSettings();
  const push = useToasts((s) => s.push);

  const success = useCallback(
    (text: string, longTask = false, action?: ToastAction) => {
      push("success", text, action);
      if (!longTask) return;
      if (settings.sound) beep(true);
      if (settings.notifications && !document.hasFocus()) void notify(t("notify.done"), text);
    },
    [push, settings.sound, settings.notifications, t],
  );

  const failure = useCallback(
    (error: unknown, longTask = false) => {
      if (isAppError(error) && error.code === "cancelled") {
        push("info", t("task.cancelled"));
        return;
      }
      const text = errorText(t, error);
      push("error", text);
      if (!longTask) return;
      if (settings.sound) beep(false);
      if (settings.notifications && !document.hasFocus()) void notify(t("notify.failed"), text);
    },
    [push, settings.sound, settings.notifications, t],
  );

  /** Sound and notification only, for an end that has a window of its own. */
  const announce = useCallback(
    (ok: boolean, text: string) => {
      if (settings.sound) beep(ok);
      if (settings.notifications && !document.hasFocus()) {
        void notify(t(ok ? "notify.done" : "notify.failed"), text);
      }
    },
    [settings.sound, settings.notifications, t],
  );

  /** Something worked but not completely, e.g. the app was installed but its data was not. */
  const warning = useCallback((text: string) => push("warning", text), [push]);

  return { success, failure, warning, announce };
}
