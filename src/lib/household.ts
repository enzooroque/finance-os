import "server-only";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type HouseholdMember = {
  userId: string;
  displayName: string;
  avatarColor: string;
  role: "owner" | "member";
};

export type Household = { id: string; name: string; members: HouseholdMember[] };

type MemberRow = {
  user_id: string;
  role: "owner" | "member";
  profiles: { display_name: string; avatar_color: string } | null;
};

/** Espaço compartilhado do usuário logado (ou null). O RLS só devolve o que ele pode ver. */
export async function getMyHousehold(): Promise<Household | null> {
  const user = await getCurrentUser();
  const supabase = await createClient();

  const { data: mine } = await supabase
    .from("household_members")
    .select("household_id, households(name)")
    .eq("user_id", user.id)
    .maybeSingle<{ household_id: string; households: { name: string } | null }>();
  if (!mine) return null;

  const { data: rows } = await supabase
    .from("household_members")
    .select("user_id, role, profiles(display_name, avatar_color)")
    .eq("household_id", mine.household_id)
    .order("joined_at")
    .returns<MemberRow[]>();

  return {
    id: mine.household_id,
    name: mine.households?.name ?? "Espaço compartilhado",
    members: (rows ?? []).map((r) => ({
      userId: r.user_id,
      role: r.role,
      displayName: r.profiles?.display_name ?? "Membro",
      avatarColor: r.profiles?.avatar_color ?? "#7c5cff",
    })),
  };
}
