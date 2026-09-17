"use client";

import { useState } from "react";
import { CheckIcon, CopyIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type ButtonProps = React.ComponentProps<typeof Button>;

interface Props {
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  text: string;
  label?: string;
  className?: string;
}

export function CopyMessageButton({ text, label = "העתק הודעה", variant = "default", size = "sm", className }: Props) {
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
          toast.success("ההודעה הועתקה — אפשר להדביק בוואטסאפ");
          setTimeout(() => setCopied(false), 1800);
        } catch {
          toast.error("לא הצלחתי להעתיק");
        }
      }}
    >
      {copied ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />}
      {label}
    </Button>
  );
}
