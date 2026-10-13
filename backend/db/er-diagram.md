# Skill Swap Platform ER Diagram

Paste this Mermaid code into any Mermaid renderer, Markdown preview that supports Mermaid, or mermaid.live.

```mermaid
erDiagram
  USERS {
    INT user_id PK
    VARCHAR name
    VARCHAR email UK
    VARCHAR password
    VARCHAR department
    TEXT bio
    VARCHAR avatar
    DECIMAL avg_rating
    INT swap_count
    TIMESTAMP created_at
  }

  SKILLS_OFFERED {
    INT id PK
    INT user_id FK
    VARCHAR skill_name
    ENUM proficiency
  }

  SKILLS_REQUESTED {
    INT id PK
    INT user_id FK
    VARCHAR skill_name
    ENUM urgency
  }

  MATCHES {
    INT match_id PK
    INT user_a FK
    INT user_b FK
    INT match_score
    ENUM status
    TIMESTAMP matched_at
  }

  SWAP_REQUESTS {
    INT request_id PK
    INT from_user FK
    INT to_user FK
    VARCHAR offered_skill
    VARCHAR requested_skill
    TEXT message
    ENUM status
    TIMESTAMP created_at
    TIMESTAMP updated_at
  }

  RATINGS {
    INT rating_id PK
    INT request_id FK
    INT rater_id FK
    INT ratee_id FK
    INT score
    TEXT comment
    TIMESTAMP created_at
  }

  SESSION_NOTES {
    INT note_id PK
    INT request_id FK
    INT author_id FK
    INT session_no
    VARCHAR topic
    TEXT notes
    TEXT resources
    INT duration_min
    TIMESTAMP created_at
  }

  SKILL_COMPLETIONS {
    INT completion_id PK
    INT request_id FK
    INT learner_id FK
    INT teacher_id FK
    VARCHAR skill_learned
    VARCHAR skill_taught
    DECIMAL avg_score
    INT total_sessions
    TIMESTAMP completed_at
  }

  USERS ||--o{ SKILLS_OFFERED : offers
  USERS ||--o{ SKILLS_REQUESTED : requests

  USERS ||--o{ MATCHES : user_a
  USERS ||--o{ MATCHES : user_b

  USERS ||--o{ SWAP_REQUESTS : sends
  USERS ||--o{ SWAP_REQUESTS : receives

  SWAP_REQUESTS ||--o{ RATINGS : has
  USERS ||--o{ RATINGS : gives
  USERS ||--o{ RATINGS : receives

  SWAP_REQUESTS ||--o{ SESSION_NOTES : tracks
  USERS ||--o{ SESSION_NOTES : writes

  SWAP_REQUESTS ||--o{ SKILL_COMPLETIONS : creates
  USERS ||--o{ SKILL_COMPLETIONS : learner
  USERS ||--o{ SKILL_COMPLETIONS : teacher
```

## Relationship Notes

- One user can offer many skills through `skills_offered`.
- One user can request many skills through `skills_requested`.
- `matches` connects two users: `user_a` and `user_b`.
- `swap_requests` connects the requesting user (`from_user`) and target user (`to_user`).
- `ratings` belongs to one swap request and connects the rater and ratee users.
- `session_notes` belongs to one swap request and one author user.
- `skill_completions` belongs to one swap request and connects learner and teacher users.

