import { requireSession } from './session.js'
import { listTasks, addTask, toggleTask } from './tasks.js'

// GET /api/tasks, POST /api/tasks, POST /api/tasks/:id/toggle
export const routes = {
  'GET /api/tasks': [requireSession, (req) => listTasks(req.user)],
  'POST /api/tasks': [requireSession, (req) => addTask(req.user, req.body.title)],
  'POST /api/tasks/:id/toggle': [requireSession, (req) => toggleTask(req.user, req.params.id)],
}
