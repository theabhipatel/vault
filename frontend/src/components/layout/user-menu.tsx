import { BookOpen, LogOut, Monitor, Moon, Palette, ShieldCheck, Sun, UserRound } from "lucide-react"
import { Link } from "react-router"

import { UserAvatar } from "@/components/user-avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useMe } from "@/hooks/api"
import { useSetTheme, useSignOut } from "@/hooks/session"
import { useTheme } from "@/lib/theme"
import type { ThemePreference } from "@/lib/types"

const THEMES: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
]

export function UserMenu() {
  const { data: me } = useMe()
  const { theme } = useTheme()
  const setTheme = useSetTheme()
  const signOut = useSignOut()
  if (!me) return null
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="rounded-full" aria-label="Account menu">
          <UserAvatar name={me.name} src={me.avatar_url} size="sm" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="flex items-center gap-3 py-2 font-normal">
          <UserAvatar name={me.name} src={me.avatar_url} />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{me.name}</p>
            <p className="text-muted-foreground truncate text-xs">{me.email}</p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem asChild>
            <Link to="/settings/profile">
              <UserRound /> Profile
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link to="/settings/security">
              <ShieldCheck /> Security & sessions
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Palette /> Theme
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuRadioGroup value={theme} onValueChange={(v) => setTheme(v as ThemePreference)}>
                {THEMES.map((t) => (
                  <DropdownMenuRadioItem key={t.value} value={t.value}>
                    <t.icon /> {t.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuItem asChild>
            <a href="/docs" target="_blank" rel="noopener">
              <BookOpen /> Documentation
            </a>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => signOut.mutate()}>
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
