import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import {
  isAppLocale,
  LOCALE_COOKIE_NAME,
  localeFromAcceptLanguage,
} from "@/lib/i18n-config";

export default async function Home() {
  const savedLocale = (await cookies()).get(LOCALE_COOKIE_NAME)?.value;
  if (savedLocale && isAppLocale(savedLocale)) {
    redirect(`/${savedLocale}`);
  }

  const acceptLanguage = (await headers()).get("accept-language");
  redirect(`/${localeFromAcceptLanguage(acceptLanguage)}`);
}
