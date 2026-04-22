# Wie Prompt Tree funktioniert

Dieses Dokument erklärt Prompt Tree **von innen nach außen**: erst die
Begriffe, dann ein konkreter Durchlauf als Nutzer, dann die Architektur –
damit du beim Lesen des Codes nicht mehr raten musst, warum etwas so
gebaut ist.

Kurzreferenzen:
- Produktidee & Anforderungen → `docs/01-product.md`
- Datenmodell & Regeln → `docs/02-domain.md` *(maßgeblich)*
- UX & Screens → `docs/03-ux.md`
- Stack & Ordnerstruktur → `docs/04-architecture.md`
- Meilensteine → `docs/05-roadmap.md`

---

## 1. Die wichtigste Idee in einem Satz

> Ein Prompt ist kein Text, sondern ein **Entscheidungsbaum mit Belegen**:
> unveränderliche Versionen, benannte Branches, Läufe gegen Testfälle,
> Bewertungen, Entscheidungen. Prompt Tree verliert keinen dieser Bausteine
> und macht sie wiederauffindbar.

Wenn du nur das behältst, verstehst du 80 % des Systems.

## 2. Die Kernbegriffe

| Begriff | Rolle | Veränderbar? |
|---|---|---|
| **Project** | Arbeitsbereich, klammert alles andere ein | ja (nur Metadaten) |
| **Prompt** | Logische Identität („Ticket-Klassifikator") | ja (nur Metadaten) |
| **Branch** | Benannter Zeiger in den Versions-Graph, z. B. `main`, `refine-v3-...` | ja (Kopf wandert) |
| **Version** | Unveränderlicher Schnappschuss: Titel, Body, Variablen, Hash | **nein** (nur `status`) |
| **Lineage-Edge** | Zusätzliche Kante im DAG (`merge`, `cherry_pick`, `refinement`) | append-only |
| **Run** | Eine Ausführung: gerenderter Prompt, Output, Tokens, Latenz | terminal |
| **Evaluation** | Score auf einen Run (human / regex / schema / similarity / rubric) | append-only |
| **Decision** | Governance-Eintrag (promote, deprecate, archive, …) | append-only |
| **Suggestion** | Vorschlag aus der Refinement-Engine, kann akzeptiert werden | Statuswechsel |

Warum so viele Tabellen? Weil ein Prompt, ein Lauf, eine Bewertung und eine
Entscheidung **unterschiedliche Lebensdauern und Semantiken** haben. Wenn
man sie in eine Tabelle drückt, verliert man Historie – genau das Problem,
das Prompt Tree lösen soll.

## 3. Ein kompletter Durchlauf (als Nutzer)

Der kürzeste Weg, das System zu begreifen.

1. **Projekt anlegen.** Startseite → Formular „New project". Slug wird aus
   dem Namen abgeleitet.
2. **Prompt anlegen.** `Prompts → New prompt`. Du gibst Name, Zweck und den
   Body der Initialversion ein. Das System erzeugt:
   - einen `Prompt`-Eintrag,
   - einen Branch `main`,
   - Version `v1` auf `main`,
   - und setzt `main` als kanonischen Branch.
   Alles in einer Transaktion – entweder alles oder nichts.
3. **Tree-Ansicht öffnen.** `Prompts → <dein Prompt>`. Links der Versionsbaum,
   rechts Metadaten. Pro Branch gibt es einen Kopf (Krone = kanonisch).
4. **Eine Version bearbeiten** = **eine neue Version anlegen.** Auf der
   Versions-Detailseite füllst du „Edit" aus. Pflichtfeld ist `changeSummary`.
   Die alte Version bleibt bestehen; die neue bekommt `number = max+1`,
   einen neuen `contentHash` und wird zum Kopf des aktuellen Branches.
5. **Branch forken.** Auf jeder Version → „Fork branch" → Name eingeben.
   Der erste Commit auf dem neuen Branch hat die Forkversion als Parent.
6. **Model-Profil anlegen.** `Models → Add profile`. Für den Einstieg reicht
   `provider = mock` – das liefert deterministische Outputs ohne API-Key.
7. **Testfall anlegen.** `Datasets → New test case` mit
   `inputVariables` als JSON-Map.
8. **Run starten.** Auf der Versions-Detailseite → „Run". Wählst Modell,
   Variablen-Bindings, optional ein oder mehrere Evaluatoren. Das System
   rendert den Prompt (Variablen werden als Strings eingesetzt, keine
   Code-Ausführung), ruft das Modell und schreibt den Run samt Evaluation.
9. **Refinement nutzen.** In der Baumansicht oben rechts „Refine".
   Die Analyzer markieren Schwächen (vage Verben, fehlende Rolle, fehlende
   Output-Format-Vorgabe, …) und schlagen einen verbesserten Body vor. Du
   kannst **annehmen** (erzeugt neue Version auf neuem Branch
   `refine-v<n>-<timestamp>` mit `refinement`-Lineage-Kante) oder ablehnen.
10. **Diffen.** `Compare` → A und B wählen. Du bekommst Text-Diff,
    Variablen-Diff, Metadaten-Diff und – wichtig – die **Runbelege**:
    Wie haben A und B auf denselben `(Testfall, Modell)`-Paaren abgeschnitten?
11. **Promoten.** Auf der Versions-Detailseite → „Promote". Zwei Modi:
    - **Pointer** (fast-forward): Zielversion ist Nachfahre des aktuellen
      kanonischen Kopfes → nur der Branchzeiger wandert.
    - **Squashed**: Es wird eine neue Version auf `main` erzeugt, Inhalt
      kopiert, Elternversion ist der bisherige Kopf, `cherry_pick`-Kante
      zur Quellversion. Das erzwingt bewusstes Überschreiben.
    In beiden Fällen entsteht ein `PromptDecision`-Eintrag mit **Pflicht-
    Rationale** – die „warum" bleibt für die Nachwelt erhalten.

## 4. Warum Versionen unveränderlich sind

Das ist die wichtigste Regel und durchdringt den gesamten Code:

- Eine alte Version ändert sich **nie** mehr. Kein „Save" überschreibt sie.
- `status` ist die **einzige** Spalte, die sich bewegen darf – und nur
  entlang einer erlaubten Übergangstabelle
  (`draft → experimental → candidate → approved → deprecated → archived`).
- Ein Revert ist kein Update, sondern eine **neue Version** mit demselben
  Inhalt. Der `contentHash` ist dann identisch, die Lineage ist ehrlich.

Das garantiert: jeder Link auf eine Version (`/p/.../v/<id>`) funktioniert
für immer und zeigt genau den Text, der einmal abgeschickt wurde. Das ist
die Basis für Audit, Rollback und Wiederauffinden.

## 5. Wie Lineage im Hintergrund aussieht

Der primäre Mechanismus ist der `parentVersionId`-Zeiger. Das ist ein Baum
(oder Forest, wenn Reverts neue Wurzeln erzeugen könnten – tun sie nicht,
weil jede Version einen Parent hat außer der Projektwurzel).

Zusätzlich gibt es **explizite Kanten** (`PromptLineageEdge`) für alles,
was ein einzelner Zeiger nicht ausdrückt:

- `merge` — zwei Parents werden in eine Version zusammengeführt (V2).
- `cherry_pick` — Inhalt von außerhalb des direkten Parents übernommen
  (z. B. bei Squashed-Promotion).
- `refinement` — diese Version ist aus einem akzeptierten
  `OptimizationSuggestion` entstanden.

Weil pro Prompt typischerweise höchstens wenige Tausend Knoten existieren,
laden UI und Dienste den kompletten Knotensatz, bauen den Baum im RAM
(`src/domain/lineage.ts`) und rendern ihn. Das erspart rekursive SQL-CTEs
und ist schnell genug.

## 6. Was eigentlich in einem „Run" steckt

Ein `PromptRun` ist **die komplette Ausführungsumgebung**, nicht nur die
Antwort:

- `renderedPrompt` – der Text, der exakt ans Modell ging
- `variableBindings` – die Werte, mit denen gerendert wurde
- `rawOutput`, `structuredOutput`
- `temperature`, `maxTokens` (auch wenn das Modellprofil Defaults hätte)
- `latencyMs`, `inputTokens`, `outputTokens`, `costEstimate`
- `status` (`queued` / `running` / `succeeded` / `failed`), `error`
- `startedAt`, `finishedAt`, `createdAt`

Das ist bewusst redundant: wenn sich später ein Modellprofil ändert, kann
man den alten Run trotzdem 1:1 rekonstruieren, weil er alles Relevante
selbst speichert.

## 7. Evaluationen – mehrere pro Run sind normal

Ein Run kann beliebig viele `PromptEvaluation`-Zeilen haben:
- `regex` – Regex oder Substring-Match gegen `expectedOutput`
- `schema` – JSON parst und matcht die Form gegen ein Beispiel
- `similarity` – Jaccard-Token-Similarity (lexikalische Baseline)
- `rubric` – Kriterien werden gestaged; Scores füllen Mensch oder LLM-Judge
- `llm_judge` – Platz für V2 (nutzt dasselbe Interface)

Jede Evaluation trägt `evaluatorKind` + optional `evaluatorRef` (Modell-
oder Rubric-ID). Kein Score kommt „aus dem Nichts" – jeder ist **attributiert**.

Ein „finaler Score" wird **nicht** gespeichert. Die Vergleichsansicht
berechnet ihn als Mittelwert der nicht-null Scores zur Laufzeit. Die
Wahrheit bleiben die einzelnen Evaluationsergebnisse.

## 8. Die Refinement-Pipeline in drei Schritten

`src/services/refinementService.ts` ist zusammen mit
`src/domain/analyzers/*` der spannendste Teil.

1. **Diagnose** (`diagnose`): Über eine Liste reiner Analyzer laufen die
   Inhalte. Jeder Analyzer emittiert `DiagnosticFinding`s mit
   `{ code, severity, detail, span? }`. MVP-Analyzer:
   - `ambiguity` (vage Verben, Hedges)
   - `missingConstraints` (JSON ohne Schema, Listen ohne Längenbegrenzung,
     fehlende Output-Format-Anweisung)
   - `unclearRole` (kein „Du bist …"-Framing)
   - `redundancy` (nahezu doppelte Sätze)
   - `underspecification` (Variablen ohne Beschreibung, keine Edge-Case-
     Behandlung)
2. **Vorschlag** (Heuristik, pluggbar): Auf Basis der Findings wird ein
   `proposedBody` gebildet (z. B. Rolle voranstellen, Output-Format-
   Hinweis anhängen) und als `OptimizationSuggestion` gespeichert.
3. **Akzeptieren** (`acceptSuggestion`): erzeugt eine neue Version auf
   einem neu geforkten Branch, schreibt eine `refinement`-Lineage-Kante
   und markiert die Suggestion als `accepted` mit Rückverweis.

Das ist bewusst nur „hilfreich", nicht „autoritativ". Die Heuristiken sind
transparent – du siehst immer, **welche Analyzer-IDs** eine Änderung
ausgelöst haben.

## 9. Die Schichten im Code

```
app/                Next.js UI + Server Actions
 └──> src/services  Anwendungsdienste (DB-Schreibzugriffe)
       ├──> src/domain     Pure TS (Regeln, keine IO)
       └──> src/adapters   Prisma-Client, Modell-Provider, Evaluatoren
```

**Regeln**, eisern:
- `src/domain/**` importiert **nichts** aus services/adapters/Prisma/fetch/env.
  Das ist die Zone, in der Invarianten ohne DB getestet werden.
- `src/services/**` besitzt **alle** Schreibpfade. UI ruft ausschließlich
  Services (über Server Actions).
- `src/adapters/**` kapselt austauschbare Technik. Ein neues Modell = eine
  Datei + eine Zeile in `registry.ts`.
- `app/**` fasst **nie** direkt Prisma an.

Wer diese Regel bricht, macht das System teuer änderbar.

## 10. Datenbank – wo was landet

SQLite im Dev (eine Datei, `prisma/dev.db`), Postgres-ready. Schema in
`prisma/schema.prisma`. Wichtige Tabellen:

- `PromptProject`, `Prompt`, `PromptBranch`, `PromptVersion`
- `PromptTemplateVariable`, `PromptLineageEdge`
- `PromptRun`, `PromptEvaluation`, `PromptRubric`
- `PromptTestCase`, `PromptDataset`
- `ModelProfile`, `PromptTag`, `PromptTagAssignment`,
  `PromptVersionTagAssignment`, `PromptNote`
- `PromptDecision`, `PromptComparison`, `OptimizationSuggestion`

Indizes sind gesetzt für die häufigen Muster:
`(promptId, number)` unique, `parentVersionId`, `contentHash`,
`(projectId, slug)` unique, `(versionId, createdAt)` auf Runs, usw.

## 11. Sicherheitsmodell (MVP)

- **Keine Auth.** Einzelnutzer-App. `createdBy` / `decidedBy` sind
  vorhanden und nullable – Auth wird später additiv angeflanscht.
- **Rendering ist sicher.** Variablen werden als Strings eingesetzt, keine
  Evaluation, kein `new Function`.
- **Eingaben werden validiert** mit Zod (in Services). Ungültiges schlägt
  mit `ValidationError` fehl; Services werfen, Server Actions lassen
  durchschlagen.
- **API-Keys** für echte Modelle (Anthropic) werden nur serverseitig aus
  `process.env` gelesen. Client-Bundles sehen sie nicht.

## 12. Lokale Installation in 60 Sekunden

```bash
npm install
cp .env.example .env          # DATABASE_URL, MODEL_PROVIDER=mock
npx prisma generate
npx prisma db push
npm run db:seed               # optionales Demo-Projekt
npm run dev
```

Tests, Typecheck, Lint:

```bash
npm run test
npm run typecheck
npm run lint
```

In CI läuft dasselbe plus `next build` gegen eine frische SQLite-Datei.

## 13. Wie man das System erweitert

| Ziel | Vorgehen |
|---|---|
| Neuer Analyzer | Datei in `src/domain/analyzers/<name>.ts`, Export in `index.ts` ergänzen. Tests in `tests/domain/analyzers.test.ts`. |
| Neuer Evaluator | Datei in `src/adapters/evaluators/<name>.ts`, Eintrag in `registry.ts`. |
| Neuer Modell-Provider | Datei in `src/adapters/models/<name>.ts`, Eintrag in `registry.ts`. |
| Neue Entität | Prisma-Schema ergänzen, neuen Service-File schreiben, `docs/02-domain.md` updaten. |
| Neue Screen-Route | Datei in `app/p/[project]/...`, Services über Server Actions rufen – niemals Prisma direkt. |

## 14. Was bewusst *nicht* eingebaut ist (MVP-Schnitt)

- Kein Auth/RBAC.
- Kein Streaming-Output in der UI.
- Kein Vektorsuch-Index (FTS läuft über SQL `LIKE`; Swap zu FTS5/pgvector in M4).
- Kein LLM-Judge-Evaluator (Interface steht, Implementation M3).
- Keine Benchmark-Zeitreihen (M3).

Warum bewusst? Weil jede dieser Features auf dem **jetzigen** Modell
additiv ist – nichts davon würde die Domänen-Regeln später
umschreiben müssen.

## 15. Glossar (fürs schnelle Nachschlagen)

- **Kanonischer Branch** – pro Prompt genau einer; sein Kopf beantwortet
  „welche Version fährt?".
- **Fast-Forward-Promotion** – Zielversion liegt in der Nachfahrenschaft
  des aktuellen Kopfes; nur ein Zeiger wandert.
- **Squashed Promotion** – neue Version auf `main` mit kopiertem Inhalt;
  erzwingt bewusstes Überschreiben der kanonischen Linie.
- **Content-Hash** – SHA-256 über NFC-normalisierten Title + Body +
  kanonisierte Messages. Für Dedup und Revert-Erkennung.
- **Lineage-Edge** – zusätzliche Kante im DAG für `merge`, `cherry_pick`,
  `refinement`.
- **Decision** – Append-only Regierungsentscheidung auf Prompt/Version.
- **Suggestion** – vorgeschlagene Nachfolger-Version aus der Refinement-
  Pipeline, mit Rationale. Annahme erzeugt eine neue Version + Kante.

---

Wenn du nach dem Lesen Code öffnest: beginne mit `prisma/schema.prisma`,
dann `src/domain/versioning.ts`, dann `src/services/versionService.ts`.
Danach ergibt sich der Rest fast von selbst.
