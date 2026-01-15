'use client'

import { supabaseBrowser } from './supabase-browser'

export async function signUp(email: string, password: string) {
  return supabaseBrowser.auth.signUp({
    email,
    password,
  })
}

export async function signIn(email: string, password: string) {
  return supabaseBrowser.auth.signInWithPassword({
    email,
    password,
  })
}

export async function signOut() {
  return supabaseBrowser.auth.signOut()
}

export async function getSession() {
  return supabaseBrowser.auth.getSession()
}
