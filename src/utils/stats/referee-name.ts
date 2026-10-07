export function normalizeReferee(value: string | null | undefined) {
  const name = value?.split(",")[0]?.trim() ?? "";
  if (!name || /^(tbc|tbd|to be (confirmed|decided)|unknown|n\/a|none)$/i.test(name)) return null;
  return name;
}
