"use client"

import { useState } from "react"
import { signUp } from "../lib/auth"

export default function SignupPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [message, setMessage] = useState("")

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    const { error } = await signUp(email, password)

    if (error) {
      setMessage(error.message)
    } else {
      setMessage("Account created successfully")
    }
  }

  return (
    <main style={{ padding: 24 }}>
      <h1>Create Account</h1>

      <form onSubmit={handleSubmit}>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        <br />

        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        <br />

        <button type="submit">Sign up</button>
      </form>

      {message && <p>{message}</p>}
    </main>
  )
}
