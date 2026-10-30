import { useState } from "react";
import { portraitUrlForName } from "@/lib/sengoku-data";

/**
 * 武将の顔写真（SLGSIM の画像を外部参照）。画像がない武将・読み込み失敗時は頭文字アイコンにフォールバックする。
 * 画像は縦長（240×340）の上部に顔があるため object-top で切り抜く。
 */
export function GeneralFace({ name, className = "h-10 w-8", fallbackClassName = "" }: { name: string; className?: string; fallbackClassName?: string }) {
  const url = portraitUrlForName(name);
  const [failed, setFailed] = useState(false);
  if (!url || failed) {
    return <span aria-hidden="true" className={`grid shrink-0 place-items-center rounded-sm border border-primary/25 bg-accent font-display font-bold text-primary ${className} ${fallbackClassName}`}>{name.slice(0, 1)}</span>;
  }
  return <img src={url} alt="" loading="lazy" onError={() => setFailed(true)} className={`shrink-0 rounded object-cover object-top ${className}`} />;
}
