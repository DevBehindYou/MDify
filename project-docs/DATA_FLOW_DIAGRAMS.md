# MarkDify — Data Flow Diagrams (DFD)

This document contains logical data-flow views for MarkDify.

---

## 1. Context-Level DFD

```mermaid
flowchart LR
    U[User]
    A[Admin]
    F[MarkDify Frontend]
    N[Normal Backends N1/N2]
    O[OCR Backends O1/O2]
    R[(Cloudflare R2)]
    D[(Cloudflare D1)]
    W[Worker API]

    U --> F
    A --> F
    F --> N
    F --> O
    F --> R
    N --> R
    O --> R
    F --> W
    N --> W
    O --> W
    W --> D
```

---

## 2. Upload and Conversion DFD

```mermaid
flowchart TD
    U[User Browser]
    F[Frontend]
    R[(R2)]
    D[Dispatcher]
    N1[N1/N2]
    O1[O1/O2]
    DB[(D1)]

    U -->|request upload ticket| F
    F -->|presigned URL| U
    U -->|upload file bytes| R
    U -->|start job| F
    F --> D
    D -->|document| N1
    D -->|image| O1
    N1 -->|read input| R
    O1 -->|read input| R
    N1 -->|write output| R
    O1 -->|write output| R
    N1 -->|update metadata| DB
    O1 -->|update metadata| DB
    F -->|read result metadata| DB
    U <-->|status/output access| F
```

---

## 3. Normal Document Conversion DFD

```mermaid
flowchart TD
    R[(R2 Input)]
    V[Validation]
    M[MarkItDown]
    P[Profile Pipeline]
    O[(R2 Output)]
    D[(D1)]

    R --> V
    V --> M
    M --> P
    P --> O
    P --> D
```

---

## 4. OCR Conversion DFD

```mermaid
flowchart TD
    R[(R2 Input)]
    V[Validation + Dimension Guard]
    I[Light Preprocessing]
    T[Tesseract OCR]
    P[Profile Pipeline]
    O[(R2 Output)]
    D[(D1)]

    R --> V
    V --> I
    I --> T
    T --> P
    P --> O
    P --> D
```

---

## 5. Admin /mdify-controller DFD

```mermaid
flowchart TD
    A[Admin]
    L[Admin Login with 2 Keys]
    S[Admin Session]
    P[MDAdmin Panel]
    D[(D1)]
    R[(R2)]
    Z[ZIP Export]
    X[Cleanup Engine]

    A --> L
    L --> S
    S --> P
    P --> D
    P --> R
    P --> Z
    P --> X
    X --> R
    X --> D
```

---

## 6. Retention and Cleanup DFD

```mermaid
flowchart TD
    J[(Jobs Table)]
    C[Cleanup Scheduler]
    R[(R2)]
    A[(Audit Logs)]
    D[(Jobs Metadata)]

    J --> C
    C -->|expired AUTO jobs| R
    C -->|update deletion state| D
    C -->|write action log| A
```

---

## 7. KPI DFD

```mermaid
flowchart TD
    J[(Jobs)]
    A[(Audit Logs)]
    K[KPI Query Layer]
    M[MDAdmin Dashboard]

    J --> K
    A --> K
    K --> M
```

---

## 8. Suggested Core KPI Blocks

The dashboard should expose at least:

- Today's jobs
- Total jobs
- Processing jobs
- Failed jobs
- Normal jobs today
- OCR jobs today
- Total input files
- Total output files
- R2 storage used
- Jobs expiring in 6h / 24h
- Indefinite KEEP jobs
- Average processing time
- Error rate
- N1/N2/O1/O2 distribution
