export const ALLOWED_ORIGIN = "https://pixelproto-x.github.io";
export const REGIONS = Object.freeze(["jp", "tw", "en", "kr", "cn"]);

export function mapPublicPath(pathname) {
  if (pathname === "/health") return "/health";
  const match = pathname.match(/^\/api\/(jp|tw|en|kr|cn)\/user\/(\d{1,20})\/profile$/);
  if (!match) return null;
  return `/api/${match[1]}/${match[2]}/profile`;
}
