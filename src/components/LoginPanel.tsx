"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRoundIcon, LogInIcon, SmartphoneIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { normalizePhone } from "@/lib/auth/phone";
import { createBrowserSupabase } from "@/lib/auth/supabase-browser";
import { authT } from "@/lib/i18n/auth";
import { useLocale } from "@/lib/i18n/client";

interface Props {
  /** Same-origin path to land on after an admin signs in (already validated by the page). */
  next: string;
  /** `?error=` from the URL: "oauth" (callback failed) or "unauthorized" (account not allowed). */
  error?: string | null;
}

/** Two tabs: Google for community managers, phone + SMS code for community members. */
export function LoginPanel({ next, error }: Props) {
  const { locale } = useLocale();
  const t = authT(locale);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [phoneInput, setPhoneInput] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");

  const errorText = error === "unauthorized" ? t("errUnauthorized") : error === "oauth" ? t("errOauth") : null;
  const msgOf = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 160);

  const signInWithGoogle = async () => {
    setBusy(true);
    try {
      const supabase = createBrowserSupabase();
      const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
      const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo } });
      if (error) throw error;
      // The browser is now navigating to Google; keep the button disabled.
    } catch (e) {
      toast.error(t("errGoogleFailed", { msg: msgOf(e) }));
      setBusy(false);
    }
  };

  const sendCode = async () => {
    const phone = normalizePhone(phoneInput);
    if (!phone) {
      toast.error(t("errPhoneInvalid"));
      return;
    }
    setBusy(true);
    try {
      const supabase = createBrowserSupabase();
      const { error } = await supabase.auth.signInWithOtp({ phone });
      if (error) throw error;
      setSentTo(phone);
      setCode("");
    } catch (e) {
      toast.error(t("errSendFailed", { msg: msgOf(e) }));
    } finally {
      setBusy(false);
    }
  };

  const verifyCode = async () => {
    if (!sentTo) return;
    const token = code.replace(/\D/g, "");
    if (token.length !== 6) {
      toast.error(t("errCodeInvalid"));
      return;
    }
    setBusy(true);
    try {
      const supabase = createBrowserSupabase();
      const { error } = await supabase.auth.verifyOtp({ phone: sentTo, token, type: "sms" });
      if (error) throw error;
      router.push("/ask");
      router.refresh();
    } catch (e) {
      const msg = msgOf(e);
      toast.error(/invalid|expired|token/i.test(msg) ? t("errCodeInvalid") : t("errVerifyFailed", { msg }));
      setBusy(false);
    }
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          <LogInIcon className="size-5 text-primary" />
          {t("loginTitle")}
        </CardTitle>
        <p className="text-sm text-muted-foreground">{t("loginSubtitle")}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {errorText ? (
          <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {errorText}
          </p>
        ) : null}

        <Tabs defaultValue="admin">
          <TabsList className="w-full">
            <TabsTrigger value="admin">{t("tabAdmin")}</TabsTrigger>
            <TabsTrigger value="member">{t("tabMember")}</TabsTrigger>
          </TabsList>

          <TabsContent value="admin" className="space-y-3 pt-3">
            <Button type="button" className="h-10 w-full" onClick={() => void signInWithGoogle()} disabled={busy}>
              <GoogleMark />
              {t("google")}
            </Button>
            <p className="text-xs text-muted-foreground">{t("googleHint")}</p>
          </TabsContent>

          <TabsContent value="member" className="pt-3">
            {sentTo === null ? (
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  void sendCode();
                }}
              >
                <div className="space-y-1.5">
                  <Label htmlFor="login-phone">{t("phoneLabel")}</Label>
                  <Input
                    id="login-phone"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    dir="ltr"
                    placeholder={t("phonePlaceholder")}
                    value={phoneInput}
                    onChange={(e) => setPhoneInput(e.target.value)}
                    disabled={busy}
                    className="h-10 text-base md:text-sm"
                  />
                  <p className="text-xs text-muted-foreground">{t("phoneHint")}</p>
                </div>
                <Button type="submit" className="h-10 w-full" disabled={busy || !phoneInput.trim()}>
                  <SmartphoneIcon className="size-4" />
                  {t("sendCode")}
                </Button>
              </form>
            ) : (
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  void verifyCode();
                }}
              >
                <p className="text-sm text-muted-foreground">
                  {t("codeSentTo")}{" "}
                  <span dir="ltr" className="font-medium text-foreground">
                    {sentTo}
                  </span>
                </p>
                <div className="space-y-1.5">
                  <Label htmlFor="login-code">{t("codeLabel")}</Label>
                  <Input
                    id="login-code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]*"
                    maxLength={6}
                    dir="ltr"
                    placeholder="123456"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    disabled={busy}
                    autoFocus
                    className="h-10 text-center text-lg tracking-[0.4em]"
                  />
                </div>
                <Button type="submit" className="h-10 w-full" disabled={busy || code.length !== 6}>
                  <KeyRoundIcon className="size-4" />
                  {t("verify")}
                </Button>
                <div className="flex justify-between text-xs">
                  <button type="button" className="text-muted-foreground hover:underline" onClick={() => setSentTo(null)} disabled={busy}>
                    {t("changePhone")}
                  </button>
                  <button type="button" className="text-primary hover:underline" onClick={() => void sendCode()} disabled={busy}>
                    {t("resend")}
                  </button>
                </div>
              </form>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

/** Google "G" in brand colours; inline so the login page has no external asset. */
function GoogleMark() {
  return (
    <svg className="size-4" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.3-1.6 3.8-5.5 3.8-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.9 1.5l2.6-2.5C16.9 3.1 14.7 2 12 2 6.5 2 2 6.5 2 12s4.5 10 10 10c5.8 0 9.6-4.1 9.6-9.8 0-.7-.1-1.2-.2-1.7H12z" />
    </svg>
  );
}
