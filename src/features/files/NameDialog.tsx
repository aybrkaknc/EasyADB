import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "../../shared/ui/Button";
import { Field, Input } from "../../shared/ui/Controls";
import { Dialog } from "../../shared/ui/Dialog";

/** Asks for the name of a file or folder. */
export function NameDialog({
  title,
  initial,
  onSubmit,
  onClose,
}: {
  title: string;
  initial: string;
  onSubmit: (name: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(initial);
  const valid = name.trim() !== "" && !name.includes("/") && !name.includes("\\");
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button onClick={() => onSubmit(name.trim())} disabled={!valid}>
            {t("common.save")}
          </Button>
        </>
      }
    >
      <Field label={title}>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && valid && onSubmit(name.trim())}
          autoFocus
        />
      </Field>
    </Dialog>
  );
}
