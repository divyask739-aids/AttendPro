import { Outlet } from 'react-router-dom'

import { BottomNav } from './BottomNav'
import { Sidebar } from './Sidebar'

export function AppLayout() {
  return (
    <div className="min-h-dvh">
      <Sidebar />
      <div className="lg:pl-64">
        <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/80 px-4 py-3 backdrop-blur lg:hidden">
          <p className="text-sm font-bold tracking-tight text-slate-900">AttendPro</p>
        </header>
        <main className="mx-auto w-full max-w-5xl px-4 pb-24 pt-6 lg:px-8 lg:pb-12 lg:pt-8">
          <Outlet />
        </main>
      </div>
      <BottomNav />
    </div>
  )
}
