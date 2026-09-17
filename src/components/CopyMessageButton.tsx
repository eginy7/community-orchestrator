"use client";

import { useState } from "react";
import { CheckIcon, CopyIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/client";

type ButtonProps = React.ComponentProps<typeof Button>;

interface Props {
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  text: string;
  /** Defaults to the localized "copy message". */
  label?: string;
  className?: string;
}

export function CopyMessageButton({ text, label, variant = "default", size = "sm", className }: Props) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={className}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          toast.success(t("card.copied"));
          setTimeout(() => setCopied(false), 1800);
        } catch {
          toast.error(t("card.copyFailed"));
        }
      }}
    >
      {copied ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />}
      {label ?? t("card.copyMessage")}
    </Button>
  );
}
