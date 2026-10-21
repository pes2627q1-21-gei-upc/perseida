---
titol: "Model de domini"
tipus: arquitectura
estat: vigent
data: "2026-10-14"
us: ["TG-85", "TG-40", "TG-70", "TG-113"]
font: "incepció 2 §7 (diagrama de classes UML, inc2_18.png); Taiga: backlog (llistat de US, 2026-10-07)"
etiquetes: [arquitectura, domini, uml, model]
---

# Model de domini

Classes del diagrama UML de la incepció 2 (§7), agrupades pels seus quatre paquets.

> [!warning] Pot canviar
> Les classes i relacions representades poden canviar al llarg del projecte (així ho diu la incepció 2).

> [!note] Lectura del diagrama
> Els atributs i les etiquetes de relació s'han transcrit tal com es llegeixen a la imatge. Les multiplicitats d'alguns extrems no es llegeixen amb claredat (línies que se solapen al voltant de `User`); aquí només es llisten les que es veuen bé i la resta es dona sense multiplicitat.

> [!info] Implementat: usuari
> `User` ja té taula i entitat (TG-135), amb més atributs que el diagrama; vegeu [[#Usuari (implementat)]].

## Gamificació

| Classe | Atributs |
|---|---|
| `Achievement` | `achievementId: ID`, `name: String`, `description: String` |
| `UserAchievement` | `unlockedAt: DateTime` |
| `DailyQuiz` | `quizDate: Date`, `language: String` |
| `QuizResult` | `resultId: ID`, `score: Integer`, `completedAt: DateTime` |
| `DailyStreak` | `streakId: ID`, `currentCount: Integer`, `lastActivityDate: Date` |

## Usuaris i esdeveniments

| Classe | Atributs |
|---|---|
| `User` | `userId: ID`, `preferredLanguage: String`, `role: String`, `accountStatus: String` |
| `DeviceRegistration` | `deviceToken: String` |
| `EventSubscription` | `subscriptionId: ID`, `createdAt: DateTime` |
| `AstronomicalEvent` | `eventId: ID`, `type: String`, `dateTime: DateTime`, `latitude: Decimal`, `longitude: Decimal` |
| `ObservationZone` | `zoneId: ID`, `latitude: Decimal`, `longitude: Decimal`, `cloudCoverage: Decimal`, `lightPollution: Decimal`, `recommendationScore: Decimal` |
| `APOD` | `apodDate: Date`, `title: String`, `explanation: String`, `mediaType: String` (`image`/`video`), `mediaUrl: String`, `copyright: String` (opcional) |

## Notificacions i moderació

| Classe | Atributs |
|---|---|
| `ContentReport` | `reportId: ID`, `status: String`, `createdAt: DateTime` |
| `Notification` | `notificationId: ID`, `notificationType: String`, `scheduledAt: DateTime` |
| `NotificationPreference` | `preferenceId: ID`, `eventType: String`, `dateCriteria: String`, `proximityCriteria: String` |

## Comunitat i missatgeria

| Classe | Atributs |
|---|---|
| `EventChatRoom` | `roomId: ID` |
| `DirectConversation` | `conversationId: ID` |
| `ChatMessage` | `messageId: ID`, `text: String`, `sentAt: DateTime` |

## Relacions principals

Etiquetes tal com apareixen al diagrama:

- `Achievement` 1 — 0..* `UserAchievement` («fita»); `User` — `UserAchievement` («fites desbloquejades»).
- `DailyQuiz` 1 — 0..* `QuizResult` («resultats»); `User` — `QuizResult` («obté»).
- `User` — `DailyStreak` («registre d'activitat»).
- `User` 1 — 0..* `DeviceRegistration` («dispositius»); `User` — `User` («segueix»).
- `User` — `EventSubscription` («subscripcions»); `EventSubscription` 0..* — 1 `AstronomicalEvent` («esdeveniment»).
- `User` 1 — 0..* `ContentReport` («crea denúncies»); `User` 1 — 0..* `Notification` («rep»); `User` 1 — 0..* `NotificationPreference` («preferències»).
- `AstronomicalEvent` 1 — 0..1 `EventChatRoom` («sala de xat»).
- `EventChatRoom` 1 — 0..* `ChatMessage` («historial»); `DirectConversation` 1 — 0..* `ChatMessage` («historial»).
- `User` — `EventChatRoom` («participa»); `User` — `ChatMessage` («envia»); `User` 2 — 0..* `DirectConversation` («participants»: 2 usuaris per conversa).
- No s'assigna amb certesa: les tres multiplicitats «1» de la part superior de `User`, l'extrem `User` de les relacions «fites desbloquejades», «obté», «registre d'activitat» i «subscripcions», les de les tres línies llargues de la part inferior (`User` amb `EventChatRoom`, `ChatMessage` i `DirectConversation`, més enllà del «2» ja indicat) i la de l'autorelació «segueix». Es donen sense multiplicitat.
- `ObservationZone` i `APOD` apareixen al paquet «Usuaris i esdeveniments» sense cap relació dibuixada.

## Usuari (implementat)

Entitat `app/domain/users/models.py`; taules a `app/infrastructure/users/tables.py` (migració `create_users`). Convencions: [[0023-convencions-del-model-de-dades]].

| Camp | Notes |
|---|---|
| `id` | `uuid` UUIDv7, clau primària interna |
| `email` | únic, en minúscules; mai clau |
| `display_name`, `avatar_url` | opcionals (perfil de Google) |
| `preferred_language` | `ca` (per defecte), `es`, `en` |
| `role` | `user` (per defecte), `moderator`, `admin` |
| `status` | `active` (per defecte), `suspended`, `banned` |
| `created_at`, `last_login_at` | `timestamptz` |
| `deleted_at` | nul = actiu; soft delete |

`user_identities(provider, subject, user_id, created_at)`: identitat externa (`google_sub` = `subject`), PK `(provider, subject)`, FK a `users`. A l'entitat de domini, `google_sub` és un camp de `User`; el repositori ho mapeja.

## Diagrama (transcripció)

```mermaid
classDiagram
    class Achievement {
        achievementId: ID
        name: String
        description: String
    }
    class UserAchievement {
        unlockedAt: DateTime
    }
    class DailyQuiz {
        quizDate: Date
        language: String
    }
    class QuizResult {
        resultId: ID
        score: Integer
        completedAt: DateTime
    }
    class DailyStreak {
        streakId: ID
        currentCount: Integer
        lastActivityDate: Date
    }
    class User {
        userId: ID
        preferredLanguage: String
        role: String
        accountStatus: String
    }
    class DeviceRegistration {
        deviceToken: String
    }
    class EventSubscription {
        subscriptionId: ID
        createdAt: DateTime
    }
    class AstronomicalEvent {
        eventId: ID
        type: String
        dateTime: DateTime
        latitude: Decimal
        longitude: Decimal
    }
    class ObservationZone {
        zoneId: ID
        latitude: Decimal
        longitude: Decimal
        cloudCoverage: Decimal
        lightPollution: Decimal
        recommendationScore: Decimal
    }
    class APOD {
        apodDate: Date
        title: String
        explanation: String
        mediaType: String
        mediaUrl: String
        copyright: String
    }
    class ContentReport {
        reportId: ID
        status: String
        createdAt: DateTime
    }
    class Notification {
        notificationId: ID
        notificationType: String
        scheduledAt: DateTime
    }
    class NotificationPreference {
        preferenceId: ID
        eventType: String
        dateCriteria: String
        proximityCriteria: String
    }
    class EventChatRoom {
        roomId: ID
    }
    class DirectConversation {
        conversationId: ID
    }
    class ChatMessage {
        messageId: ID
        text: String
        sentAt: DateTime
    }
    Achievement "1" --> "0..*" UserAchievement : fita
    User --> UserAchievement : fites desbloquejades
    DailyQuiz "1" --> "0..*" QuizResult : resultats
    User --> QuizResult : obté
    User --> DailyStreak : registre d'activitat
    User "1" --> "0..*" DeviceRegistration : dispositius
    User --> User : segueix
    User --> EventSubscription : subscripcions
    EventSubscription "0..*" --> "1" AstronomicalEvent : esdeveniment
    User "1" --> "0..*" ContentReport : crea denúncies
    User "1" --> "0..*" Notification : rep
    User "1" --> "0..*" NotificationPreference : preferències
    AstronomicalEvent "1" --> "0..1" EventChatRoom : sala de xat
    EventChatRoom "1" --> "0..*" ChatMessage : historial
    DirectConversation "1" --> "0..*" ChatMessage : historial
    User --> EventChatRoom : participa
    User --> ChatMessage : envia
    User "2" --> "0..*" DirectConversation : participants
```

## Enllaços

- [[visio-general]], [[backend-hexagonal]], [[postgres]]
- [[0004-arquitectura-hexagonal-i-tdd-al-domini]], [[0006-postgresql-postgis-font-de-veritat]]
- [[epiques-i-us]]
