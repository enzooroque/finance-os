import { getMyHousehold } from "@/lib/household";
import { ViewHint } from "./view-hint";
import { ViewSwitcher } from "./view-switcher";

/** Lê no servidor se a pessoa tem espaço compartilhado (fica dentro de <Suspense>). */
export async function ViewSwitcherLive({ className }: { className?: string }) {
  const household = await getMyHousehold();
  return <ViewSwitcher className={className} hasHousehold={!!household} />;
}

export async function ViewHintLive() {
  const household = await getMyHousehold();
  return <ViewHint hasHousehold={!!household} />;
}
