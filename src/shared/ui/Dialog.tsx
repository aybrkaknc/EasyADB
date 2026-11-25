import { Dialog as RDialog } from "radix-ui";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { useConfirmStore } from "../hooks/useConfirm";
import { Button } from "./Button";

export function Dialog({
  open,
  onOpenChange,
  title,
  children,
  footer,
  locked = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  /** Only its buttons close it: not Escape and not a click outside. */
  locked?: boolean;
}) {
  const keep = (event: Event) => locked && event.preventDefault();
  return (
    <RDialog.Root open={open} onOpenChange={onOpenChange}>
      <RDialog.Portal>
        <RDialog.Overlay className="fixed inset-0 z-40 bg-black/70" />
        <RDialog.Content
          onEscapeKeyDown={keep}
          onInteractOutside={keep}
          className="clip-corners fixed top-1/2 left-1/2 z-50 w-[min(520px,92vw)] -translate-x-1/2 -translate-y-1/2 border border-neon/40 bg-panel p-6 shadow-2xl"
        >
          <RDialog.Title className="heading mb-4 text-base">{title}</RDialog.Title>
          <RDialog.Description asChild>
            <div className="flex flex-col gap-4 text-xs text-white/80">{children}</div>
          </RDialog.Description>
          {footer && <div className="mt-6 flex justify-end gap-2">{footer}</div>}
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  );
}

export function ConfirmHost() {
  const { t } = useTranslation();
  const request = useConfirmStore((s) => s.request);
  const set = useConfirmStore((s) => s.set);
  const answer = (ok: boolean) => {
    request?.resolve(ok);
    set(null);
  };
  return (
    <Dialog
      open={request !== null}
      onOpenChange={(open) => !open && answer(false)}
      title={t("common.confirm")}
      footer={
        <>
          <Button variant="ghost" onClick={() => answer(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            variant={request?.danger ? "danger" : "primary"}
            onClick={() => answer(true)}
            autoFocus
          >
            {t("common.confirm")}
          </Button>
        </>
      }
    >
      <p className="text-sm whitespace-pre-wrap">{request?.message}</p>
    </Dialog>
  );
}
