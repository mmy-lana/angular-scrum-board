/**
 * A scrum board project. The project key is the human-readable prefix used to
 * build issue keys (for example `SCRUM-42`).
 */
export interface Project {
  id: string;
  key: string;
  name: string;
  description: string;
  createdAt: string;
}
