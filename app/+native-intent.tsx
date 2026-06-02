import { buildTaskDeepLinkRedirectPath } from "../utils/deepLinkHelpers";

export function redirectSystemPath({
  path,
}: {
  path: string | null;
  initial: boolean;
}) {
  try {
    if (!path) return "/";
    return buildTaskDeepLinkRedirectPath(path) || path;
  } catch {
    return path || "/";
  }
}
