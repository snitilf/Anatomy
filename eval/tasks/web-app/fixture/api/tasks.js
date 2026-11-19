import { db } from '../db/connection.js'

export const listTasks = (user) => db.all('SELECT * FROM tasks WHERE user_id = ?', user)
export const addTask = (user, title) => db.run('INSERT INTO tasks (user_id, title) VALUES (?, ?)', user, title)
export const toggleTask = (user, id) => db.run('UPDATE tasks SET done = NOT done WHERE id = ? AND user_id = ?', id, user)
