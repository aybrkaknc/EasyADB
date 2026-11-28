import { Dialog as RDialog } from "radix-ui";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { useConfirmStore } from "../hooks/useConfirm";
import { cn } from "../lib/cn";
import { Button } from "./Button";

export function Dialog({
  open,
  onOpenChange,
  title,
  children,
  footer,
  locked = false,
  large = false,
  wide = false,
  huge = false,
  titleClass,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  /** Only its buttons close it: not Escape and not a click outside. */
  locked?: boolean;
  /** Bigger text, for the windows of jobs. */
  large?: boolean;
  wide?: boolean;
  /** For windows that list files. */
  huge?: boolean;
  titleClass?: string;
}) {
  const keep = (event: Event) => locked && event.preventDefault();
  return (
    <RDialog.Root open={open} onOpenChange={onOpenChange}>
      <RDialog.Portal>
        <RDialog.Overlay className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm" />
        <RDialog.Content
          onEscapeKeyDown={keep}
          onInteractOutside={keep}
          className={cn(
            "clip-corners fixed inset-0 z-50 m-auto h-fit border border-white/15 bg-black p-6 shadow-2xl",
            huge ? "w-[min(960px,94vw)]" : wide ? "w-[min(600px,92vw)]" : "w-[min(520px,92vw)]",
          )}
        >
          <RDialog.Title
            className={cn("heading mb-4", large ? "text-xl" : "text-base", titleClass)}
          >
            {title}
          </RDialog.Title>
          <RDialog.Description asChild>
            <div className={cn("flex flex-col gap-4 text-white/80", large ? "text-sm" : "text-xs")}>
              {children}
            </div>
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
