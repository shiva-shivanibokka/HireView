export interface Job {
  id:              string
  title:           string
  company:         string
  location:        string
  job_type:        string   // full-time | part-time | contract | internship | ""
  workplace:       string   // remote | hybrid | onsite | ""
  source:          string
  url:             string
  description:     string
  required_skills: string[]
  keywords:        string[]
  match_score:     number
  scraped_at:      string
  posted_at:       string
  status:          "new" | "saved" | "dismissed"
}
