export const ALLOWED_ORIGIN = "https://pixelproto-x.github.io";
export const REGIONS = Object.freeze(["jp", "tw", "en", "kr", "cn"]);

export function parseProfilePath(pathname) {
  const match = pathname.match(/^\/api\/(jp|tw|en|kr|cn)\/user\/(\d{1,20})\/profile$/);
  if (!match) return null;
  return { region: match[1], uid: match[2] };
}
