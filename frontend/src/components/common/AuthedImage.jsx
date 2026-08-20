import { forwardRef, useEffect, useState } from "react";
import { api } from "@/api/axios";
import { cn } from "@/lib/utils";

/**
 * Images live behind `GET /api/scan/image/...`, which requires a Bearer token —
 * a plain <img src> cannot send one. This fetches the bytes through the Axios
 * instance (so the interceptor attaches the token and can refresh it) and
 * renders the result from an object URL.
 *
 * Any src that is not an /api path — a blob: URL from the upload preview, or a
 * mock-mode object URL — is passed straight through.
 *
 * @param {{ src: string, alt: string }} props
 */
export const AuthedImage = forwardRef(function AuthedImage(
  { src, alt, className, onLoad, ...props },
  ref
) {
  const needsAuth = src?.startsWith("/api/");
  const [objectUrl, setObjectUrl] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!needsAuth || !src) return;

    let revoked = false;
    let url;

    api
      .get(src.replace(/^\/api/, ""), { responseType: "blob" })
      .then((response) => {
        if (revoked) return;
        url = URL.createObjectURL(response.data);
        setObjectUrl(url);
      })
      .catch(() => !revoked && setFailed(true));

    return () => {
      revoked = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [src, needsAuth]);

  if (failed) {
    return (
      <div className={cn("flex items-center justify-center bg-ink-800 text-[0.65rem] text-ash-500", className)}>
        unavailable
      </div>
    );
  }

  const resolved = needsAuth ? objectUrl : src;

  if (!resolved) {
    return <div className={cn("animate-pulse bg-ink-800", className)} aria-hidden />;
  }

  return (
    <img ref={ref} src={resolved} alt={alt} className={className} onLoad={onLoad} {...props} />
  );
});
