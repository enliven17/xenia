import {
  ArrowLeftRight,
  Download,
  Inbox,
  Key,
  Layers,
  LayoutDashboard,
  LogOut,
  Send,
  Sparkles,
  Wallet,
} from "lucide-react";
import { Link, useLocation } from "wouter";
import type { User } from "@shared/schema";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn, getInitials } from "@/lib/utils";

interface AppSidebarProps {
  user: User;
  onLogout: () => void;
}

interface NavItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
}

const navItems: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/send-tips", label: "Send Tip", icon: Send },
  { href: "/batch-send", label: "Batch Send", icon: Layers },
  { href: "/claims", label: "Pending Claims", icon: Inbox },
  { href: "/transactions", label: "Transactions", icon: ArrowLeftRight },
  { href: "/deposit", label: "Deposit", icon: Download },
  { href: "/link-wallet", label: "Link Wallet", icon: Wallet },
  { href: "/extension-key", label: "Extension Key", icon: Key },
];

export function AppSidebar({ user, onLogout }: AppSidebarProps) {
  const [location] = useLocation();

  return (
    <Sidebar>
      <SidebarHeader>
        <Link
          href="/dashboard"
          className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-gradient-to-br from-violet-600 to-indigo-600 text-white">
            <Sparkles className="h-4 w-4" aria-hidden="true" />
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-semibold">Xenia</span>
            <span className="text-[10px] text-muted-foreground">Somnia SocialFi</span>
          </div>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigate</SidebarGroupLabel>
          <SidebarMenu>
            {navItems.map((item) => {
              const isActive = location === item.href || location.startsWith(`${item.href}/`);
              const Icon = item.icon;
              return (
                <SidebarMenuItem key={item.href}>
                  <Link href={item.href}>
                    <a
                      aria-current={isActive ? "page" : undefined}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        isActive
                          ? "bg-gradient-to-r from-violet-600/15 to-indigo-600/15 text-violet-700 dark:text-violet-300"
                          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                      )}
                    >
                      <Icon className="h-4 w-4" aria-hidden="true" />
                      <span>{item.label}</span>
                    </a>
                  </Link>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <div className="flex items-center gap-3">
          <Avatar
            src={user.twitterAvatar}
            alt={user.twitterName ?? user.twitterHandle}
            fallback={getInitials(user.twitterName ?? user.twitterHandle)}
          />
          <div className="flex min-w-0 flex-1 flex-col leading-tight">
            <span className="truncate text-sm font-medium">
              {user.twitterName ?? user.twitterHandle}
            </span>
            <span className="truncate text-xs text-muted-foreground">
              @{user.twitterHandle}
            </span>
          </div>
          <ThemeToggle />
        </div>
        <Button variant="outline" size="sm" onClick={onLogout} className="w-full">
          <LogOut className="h-4 w-4" />
          <span>Log out</span>
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}

interface AvatarProps {
  src: string | null;
  alt: string;
  fallback: string;
}

function Avatar({ src, alt, fallback }: AvatarProps) {
  if (src) {
    return (
      <img
        src={src}
        alt={alt}
        className="h-9 w-9 rounded-full object-cover ring-2 ring-violet-500/30"
        loading="lazy"
        referrerPolicy="no-referrer"
      />
    );
  }
  return (
    <div
      aria-label={alt}
      className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-indigo-600 text-xs font-semibold text-white"
    >
      {fallback}
    </div>
  );
}
