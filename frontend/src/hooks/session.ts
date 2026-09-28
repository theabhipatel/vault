import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "react-router"
import { toast } from "sonner"

import { qk } from "@/hooks/api"
import { client, errorMessage, unwrap } from "@/lib/api"
import { useTheme } from "@/lib/theme"
import type { Me, ThemePreference } from "@/lib/types"
import { vaultSession } from "@/vault/session"

export function useSignOut() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  return useMutation({
    mutationFn: () => {
      // Lock first: keys leave memory even if the network request fails.
      vaultSession.lock()
      return unwrap(client.POST("/api/auth/signout"))
    },
    onSettled: () => {
      queryClient.clear()
      queryClient.setQueryData(qk.me, null)
      navigate("/login", { replace: true })
    },
  })
}

/** Change the theme locally at once and remember it on the account. */
export function useSetTheme() {
  const { setTheme } = useTheme()
  const queryClient = useQueryClient()
  const save = useMutation({
    mutationFn: (theme: ThemePreference) => unwrap(client.PATCH("/api/account", { body: { theme } })),
    onSuccess: (me) => queryClient.setQueryData<Me | null>(qk.me, me),
    onError: (error) => toast.error(errorMessage(error)),
  })
  return (theme: ThemePreference) => {
    setTheme(theme)
    save.mutate(theme)
  }
}
