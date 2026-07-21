"use client";

import { Button } from "@heroui/react";
import { Languages, LoaderCircle, ShieldCheck } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { type FormEvent, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

import { authClient } from "@/lib/auth-client";
import { useI18n } from "@/lib/i18n";

type AuthMode = "signIn" | "signUp";

const subscribeToClient = () => () => undefined;

function GoogleMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5">
      <path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.9h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.4Z" />
      <path fill="#34A853" d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1a5.8 5.8 0 0 1-5.5-4H3.2v2.6A10 10 0 0 0 12 22Z" />
      <path fill="#FBBC05" d="M6.5 14a6 6 0 0 1 0-3.9V7.5H3.2a10 10 0 0 0 0 9.2L6.5 14Z" />
      <path fill="#EA4335" d="M12 6c1.6 0 3 .5 4.2 1.6l3-3A10 10 0 0 0 3.2 7.5l3.3 2.6A5.8 5.8 0 0 1 12 6Z" />
    </svg>
  );
}

function authErrorMessage(code: string | undefined, isEnglish: boolean) {
  switch (code) {
    case "INVALID_EMAIL_OR_PASSWORD":
    case "INVALID_PASSWORD":
      return isEnglish ? "The email address or password is incorrect." : "メールアドレスまたはパスワードが正しくありません。";
    case "USER_ALREADY_EXISTS":
    case "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL":
      return isEnglish ? "This email is already registered. Try signing in." : "このメールアドレスはすでに登録されています。ログインをお試しください。";
    case "PASSWORD_TOO_SHORT":
      return isEnglish ? "Enter a password with at least 8 characters." : "パスワードは8文字以上で入力してください。";
    case "PASSWORD_TOO_LONG":
      return isEnglish ? "The password must be 128 characters or fewer." : "パスワードは128文字以内で入力してください。";
    default:
      return isEnglish ? "Authentication failed. Check your details and try again." : "認証できませんでした。入力内容を確認して、もう一度お試しください。";
  }
}

export function SignInView() {
  const { locale, isEnglish, t } = useI18n();
  const canUsePortal = useSyncExternalStore(
    subscribeToClient,
    () => true,
    () => false,
  );
  const [mode, setMode] = useState<AuthMode>("signIn");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pendingAction, setPendingAction] = useState<"google" | "email" | null>(null);
  const [error, setError] = useState<string | null>(null);

  function changeMode(nextMode: AuthMode) {
    setMode(nextMode);
    setError(null);
  }

  async function signInWithGoogle() {
    setPendingAction("google");
    setError(null);

    try {
      const result = await authClient.signIn.social({
        provider: "google",
        callbackURL: `/${locale}`,
      });

      if (result.error) {
        setError(t("Googleログインを開始できませんでした。もう一度お試しください。", "Could not start Google sign-in. Please try again."));
        setPendingAction(null);
      }
    } catch {
      setError(t("Googleログインを開始できませんでした。通信状況をご確認ください。", "Could not start Google sign-in. Check your connection."));
      setPendingAction(null);
    }
  }

  async function submitEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (mode === "signUp" && !name.trim()) {
      setError(t("表示名を入力してください。", "Enter your display name."));
      return;
    }

    if (password.length < 8) {
      setError(t("パスワードは8文字以上で入力してください。", "Enter a password with at least 8 characters."));
      return;
    }

    setPendingAction("email");

    try {
      const result = mode === "signUp"
        ? await authClient.signUp.email({
            name: name.trim(),
            email: email.trim(),
            password,
            callbackURL: `/${locale}`,
          })
        : await authClient.signIn.email({
            email: email.trim(),
            password,
            callbackURL: `/${locale}`,
          });

      if (result.error) {
        setError(authErrorMessage(result.error.code, isEnglish));
        setPendingAction(null);
        return;
      }

      window.location.assign(`/${locale}`);
    } catch {
      setError(t("認証サーバーに接続できませんでした。通信状況をご確認ください。", "Could not reach the authentication server. Check your connection."));
      setPendingAction(null);
    }
  }

  const isPending = pendingAction !== null;

  const languageSwitcher = (
    <nav
      aria-label={t("表示言語", "Display language")}
      className="flex items-center gap-1 rounded-xl border border-[#e1e3ed] bg-white p-1 shadow-sm"
      style={{
        position: "fixed",
        top: "max(1rem, env(safe-area-inset-top))",
        right: "max(1rem, env(safe-area-inset-right))",
        zIndex: 100,
      }}
    >
      <Languages size={16} className="ml-2 text-[#68708f]" aria-hidden="true" />
      <Link
        href="/jp-ja"
        hrefLang="ja"
        aria-current={locale === "jp-ja" ? "page" : undefined}
        className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${locale === "jp-ja" ? "bg-[#edeaff] text-[#4e3ad0]" : "text-[#68708f] hover:bg-[#f5f6fa] hover:text-[#31384f]"}`}
      >
        日本語
      </Link>
      <Link
        href="/us-en"
        hrefLang="en"
        aria-current={locale === "us-en" ? "page" : undefined}
        className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${locale === "us-en" ? "bg-[#edeaff] text-[#4e3ad0]" : "text-[#68708f] hover:bg-[#f5f6fa] hover:text-[#31384f]"}`}
      >
        English
      </Link>
    </nav>
  );

  return (
    <>
      {canUsePortal ? createPortal(languageSwitcher, document.body) : null}
      <main className="grid min-h-dvh place-items-center bg-[#f7f8fc] px-5 py-20 text-[#111735]">
      <section className="w-full max-w-sm rounded-3xl border border-[#e5e7f1] bg-white px-6 py-8 text-center shadow-[0_20px_60px_rgba(27,35,83,0.08)]">
        <Image
          src="/echly-favicon-v031.png"
          alt=""
          width={56}
          height={56}
          priority
          className="mx-auto size-14 rounded-2xl"
        />
        <p className="mt-5 text-xs font-bold tracking-[0.14em] text-[#5b42ff]">ECHLY</p>
        <h1 className="mt-2 text-2xl font-bold">{t("明日を、無理なく整える", "A calmer plan for tomorrow")}</h1>
        <p className="mt-3 text-sm leading-6 text-[#68708f]">
          {t("お好きな方法でログインして、音声チェックインを始めましょう。", "Choose how you'd like to sign in and start your voice check-in.")}
        </p>

        <Button
          variant="outline"
          size="lg"
          fullWidth
          isDisabled={isPending}
          onPress={signInWithGoogle}
          className="mt-7 h-12 border-[#dfe2ed] bg-white font-semibold"
        >
          {pendingAction === "google" ? <LoaderCircle size={19} className="animate-spin" /> : <GoogleMark />}
          {pendingAction === "google" ? t("Googleへ移動中...", "Opening Google...") : t("Googleで続ける", "Continue with Google")}
        </Button>

        <div className="my-6 flex items-center gap-3 text-[11px] text-[#8a91aa]">
          <span className="h-px flex-1 bg-[#e5e7f1]" />
          {t("またはメールアドレス", "or use email")}
          <span className="h-px flex-1 bg-[#e5e7f1]" />
        </div>

        <div className="grid grid-cols-2 rounded-lg bg-[#f2f3f8] p-1 text-xs font-semibold">
          <button type="button" onClick={() => changeMode("signIn")} className={`rounded-md px-3 py-2 transition-colors ${mode === "signIn" ? "bg-white text-[#3120a8] shadow-sm" : "text-[#68708f]"}`}>{t("ログイン", "Sign in")}</button>
          <button type="button" onClick={() => changeMode("signUp")} className={`rounded-md px-3 py-2 transition-colors ${mode === "signUp" ? "bg-white text-[#3120a8] shadow-sm" : "text-[#68708f]"}`}>{t("新規登録", "Create account")}</button>
        </div>

        <form onSubmit={submitEmail} className="mt-4 space-y-3 text-left">
          {mode === "signUp" ? (
            <label className="block text-xs font-semibold text-[#414966]">
              {t("表示名", "Display name")}
              <input value={name} onChange={(event) => setName(event.currentTarget.value)} autoComplete="name" required disabled={isPending} className="mt-1.5 h-11 w-full rounded-lg border border-[#dfe2ed] bg-white px-3 text-sm font-normal outline-none transition focus:border-[#6d58ff] focus:ring-2 focus:ring-[#ded9ff] disabled:bg-[#f5f6f9]" />
            </label>
          ) : null}
          <label className="block text-xs font-semibold text-[#414966]">
            {t("メールアドレス", "Email")}
            <input type="email" value={email} onChange={(event) => setEmail(event.currentTarget.value)} autoComplete="email" inputMode="email" required disabled={isPending} className="mt-1.5 h-11 w-full rounded-lg border border-[#dfe2ed] bg-white px-3 text-sm font-normal outline-none transition focus:border-[#6d58ff] focus:ring-2 focus:ring-[#ded9ff] disabled:bg-[#f5f6f9]" />
          </label>
          <label className="block text-xs font-semibold text-[#414966]">
            {t("パスワード", "Password")}
            <input type="password" value={password} onChange={(event) => setPassword(event.currentTarget.value)} autoComplete={mode === "signUp" ? "new-password" : "current-password"} minLength={8} maxLength={128} required disabled={isPending} className="mt-1.5 h-11 w-full rounded-lg border border-[#dfe2ed] bg-white px-3 text-sm font-normal outline-none transition focus:border-[#6d58ff] focus:ring-2 focus:ring-[#ded9ff] disabled:bg-[#f5f6f9]" />
            {mode === "signUp" ? <span className="mt-1 block font-normal text-[#7a829d]">{t("8文字以上", "At least 8 characters")}</span> : null}
          </label>

          <Button type="submit" variant="primary" size="lg" fullWidth isDisabled={isPending} className="h-12 bg-[#5b42ff] font-semibold text-white">
            {pendingAction === "email" ? <LoaderCircle size={19} className="animate-spin" /> : null}
            {pendingAction === "email" ? t("処理中...", "Working...") : mode === "signUp" ? t("アカウントを作成", "Create account") : t("メールアドレスでログイン", "Sign in with email")}
          </Button>
        </form>

        {error ? <p className="mt-4 text-xs leading-5 text-[#b42345]" role="alert">{error}</p> : null}

        <p className="mt-6 flex items-center justify-center gap-1.5 text-[11px] text-[#7a829d]">
          <ShieldCheck size={14} />
          {t("認証情報は暗号化・ハッシュ化して安全に扱われます", "Your credentials are encrypted and securely hashed")}
        </p>
      </section>
      </main>
    </>
  );
}
