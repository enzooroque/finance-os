import {
  ArrowLeftRight,
  CalendarClock,
  CreditCard,
  FileBarChart,
  LayoutDashboard,
  PiggyBank,
  Settings,
  Target,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  /** Rótulo curto para a navegação inferior do celular. */
  short: string;
  icon: LucideIcon;
  description: string;
};

export const navItems: NavItem[] = [
  { href: "/", label: "Dashboard", short: "Início", icon: LayoutDashboard, description: "Visão geral das suas finanças no mês." },
  { href: "/transacoes", label: "Transações", short: "Transações", icon: ArrowLeftRight, description: "Receitas, despesas e transferências." },
  { href: "/contas", label: "Contas", short: "Contas", icon: Wallet, description: "Contas bancárias, carteiras e saldos." },
  { href: "/cartoes", label: "Cartões", short: "Cartões", icon: CreditCard, description: "Cartões de crédito, faturas e parcelamentos." },
  { href: "/contas-a-pagar", label: "Contas a pagar", short: "A pagar", icon: CalendarClock, description: "Recorrências, vencimentos e calendário." },
  { href: "/metas", label: "Metas", short: "Metas", icon: Target, description: "Objetivos individuais e do casal." },
  { href: "/orcamentos", label: "Orçamentos", short: "Orçamentos", icon: PiggyBank, description: "Limites mensais por categoria." },
  { href: "/relatorios", label: "Relatórios", short: "Relatórios", icon: FileBarChart, description: "Análises e exportação em CSV." },
  { href: "/configuracoes", label: "Configurações", short: "Ajustes", icon: Settings, description: "Perfil, espaço compartilhado e preferências." },
];

/** Itens fixos da barra inferior no celular (o resto fica no menu "Mais"). */
export const mobilePrimaryHrefs = ["/", "/transacoes", "/cartoes"] as const;

export function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
