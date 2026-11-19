import { useEffect, useState } from 'react'

export function App() {
  const [tasks, setTasks] = useState<{ id: number; title: string; done: boolean }[]>([])
  useEffect(() => {
    fetch('/api/tasks').then((r) => r.json()).then(setTasks)
  }, [])
  const add = (title: string) => fetch('/api/tasks', { method: 'POST', body: JSON.stringify({ title }) })
  const toggle = (id: number) => fetch(`/api/tasks/${id}/toggle`, { method: 'POST' })
  return <TaskList tasks={tasks} onAdd={add} onToggle={toggle} />
}
