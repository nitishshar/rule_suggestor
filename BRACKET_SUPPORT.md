# Bracket Support for "in" and "not in" Operators

## Overview

The system now supports both **parentheses `( )`** and **square brackets `[ ]`** for "in" and "not in" operators, making rules more flexible and natural.

---

## Supported Operators

### 1. **in** - with ( ) or [ ]
```
✅ life cycle status code in (ACTIVE,CLOSED)
✅ life cycle status code in [ACTIVE,CLOSED]
```

### 2. **not in** - with ( ) or [ ]
```
✅ life cycle status code not in (ACTIVE,CLOSED)
✅ life cycle status code not in [ACTIVE,CLOSED]
```

### 3. **is in** (NEW) - with ( ) or [ ]
```
✅ life cycle status code is in (ACTIVE,CLOSED)
✅ life cycle status code is in [ACTIVE,CLOSED]
```

### 4. **is not in** (NEW) - with ( ) or [ ]
```
✅ life cycle status code is not in (ACTIVE,CLOSED)
✅ life cycle status code is not in [ACTIVE,CLOSED]
```

---

## How It Works

### Input (Your Rule)
```
Produce Error If life cycle status code in [ACTIVE,CLOSED,PENDING]
```

### Tokenization
1. `Produce Error If` → phrase token
2. `life cycle status code` → data element token
3. `in` → operator token
4. `[` → connector token (openBracket)
5. `ACTIVE,CLOSED,PENDING` → text/value tokens
6. `]` → connector token (closeBracket)

### Drools Output
```
<Deposits.Deposits>:(life cycle status code in ('ACTIVE', 'CLOSED', 'PENDING'))
```

**Note:** Square brackets `[ ]` in input are converted to parentheses `( )` in Drools output (Drools standard syntax).

---

## All Valid Syntaxes

### Parentheses ( )
```
✅ Contract Identifier in (ABC,DEF,GHI)
✅ Contract Identifier not in (ABC,DEF,GHI)
✅ Contract Identifier is in (ABC,DEF,GHI)
✅ Contract Identifier is not in (ABC,DEF,GHI)
```

### Square Brackets [ ]
```
✅ Contract Identifier in [ABC,DEF,GHI]
✅ Contract Identifier not in [ABC,DEF,GHI]
✅ Contract Identifier is in [ABC,DEF,GHI]
✅ Contract Identifier is not in [ABC,DEF,GHI]
```

### Comma-Separated Values
```
✅ status in (ACTIVE, CLOSED, PENDING)    ← with spaces
✅ status in (ACTIVE,CLOSED,PENDING)      ← without spaces
✅ status in [ACTIVE, CLOSED, PENDING]    ← with spaces
✅ status in [ACTIVE,CLOSED,PENDING]      ← without spaces
```

---

## Grouping Parentheses vs List Brackets

### For Grouping (AND/OR logic)
Use **parentheses `( )`** only:
```
✅ Balance > 0 and (Status is ACTIVE or Status is PENDING)
```

### For Lists (IN operator)
Use **either parentheses `( )` or brackets `[ ]`**:
```
✅ Status in (ACTIVE,CLOSED)
✅ Status in [ACTIVE,CLOSED]
```

---

## Examples

### Example 1: Basic "in" with Brackets
**Input:**
```
Produce Error If life cycle status code in [INVALID,TEST,TEMP]
```

**Drools Output:**
```
<Deposits.Deposits>:(life cycle status code in ('INVALID', 'TEST', 'TEMP'))
```

---

### Example 2: "not in" with Brackets
**Input:**
```
Produce Error If life cycle status code not in [ACTIVE,CLOSED,PENDING]
```

**Drools Output:**
```
<Deposits.Deposits>:(life cycle status code not in ('ACTIVE', 'CLOSED', 'PENDING'))
```

---

### Example 3: "is in" (Natural Language)
**Input:**
```
Produce Error If Contract Identifier is in [INVALID,TEST,TEMP]
```

**Drools Output:**
```
<Deposits.Deposits Contract>:(Contract Identifier in ('INVALID', 'TEST', 'TEMP'))
```

---

### Example 4: "is not in" (Natural Language)
**Input:**
```
Produce Warning If Arrangement Purpose Type Code is not in [BUSINESS,PERSONAL]
```

**Drools Output:**
```
<Arrangement.Arrangement>:(Arrangement Purpose Type Code not in ('BUSINESS', 'PERSONAL'))
```

---

### Example 5: Mixed with Grouping
**Input:**
```
Produce Error If Balance is 0 and (Status in [ACTIVE,PENDING] or Amount > 1000)
```

**Drools Output:**
```
<Deposits.Deposits Account>:(Balance == 0 && (Status in ('ACTIVE', 'PENDING') || Amount > 1000))
```

---

## Autocomplete Support

### After "in" or "not in"
Autocomplete will suggest:
- `(` - Open parenthesis
- `[` - Open bracket

### Inside Lists
After opening `[` or `(`:
- Type values separated by commas
- Autocomplete suggests `,` and closing bracket/paren

---

## Configuration

### Operators Added
```json
{
  "id": "is-not-in",
  "symbol": "is not in",
  "displayLabel": "is not in",
  "droolsOperator": "not in"
},
{
  "id": "is-in",
  "symbol": "is in",
  "displayLabel": "is in",
  "droolsOperator": "in"
}
```

### Connectors Added
```json
{
  "id": "openBracket",
  "displayText": "[",
  "droolsText": "("
},
{
  "id": "closeBracket",
  "displayText": "]",
  "droolsText": ")"
}
```

**Note:** Brackets are converted to parentheses in Drools output.

---

## Validation

### Valid Patterns
```
✅ field in [A,B,C]
✅ field in (A,B,C)
✅ field not in [A,B,C]
✅ field not in (A,B,C)
✅ field is in [A,B,C]
✅ field is not in [A,B,C]
```

### Invalid Patterns
```
❌ field in A,B,C          (missing brackets/parens)
❌ field in [A,B,C)         (mismatched brackets)
❌ field in (A,B,C]         (mismatched brackets)
❌ field in []              (empty list)
```

---

## Benefits

### 1. **Flexibility**
Users can choose their preferred syntax:
- Programmers might prefer `[ ]` (array-like)
- Business users might prefer `( )` (more familiar)

### 2. **Natural Language**
"is in" and "is not in" read more naturally:
```
"The status is in the list of valid codes"
→ "Status is in [ACTIVE,CLOSED,PENDING]"
```

### 3. **Consistency**
Both syntaxes produce identical Drools output.

---

## Implementation Details

### Files Modified

1. **rule-suggestor-config.json**
   - Added "is in" and "is not in" operators
   - Added openBracket and closeBracket connectors
   - Updated examples

2. **drools-generator.service.ts**
   - Updated "in" handler to recognize both ( ) and [ ]
   - Converts [ ] to ( ) in Drools output

3. **rule-editor.component.ts**
   - Updated validation to accept both bracket types
   - Updated error messages

---

## Testing

### Test Case 1: Square Brackets
**Input:** `Produce Error If status in [A,B,C]`
**Expected:** `<Entity>:(status in ('A', 'B', 'C'))`

### Test Case 2: Natural Language
**Input:** `Produce Error If status is in [A,B,C]`
**Expected:** `<Entity>:(status in ('A', 'B', 'C'))`

### Test Case 3: "is not in"
**Input:** `Produce Error If status is not in (A,B,C)`
**Expected:** `<Entity>:(status not in ('A', 'B', 'C'))`

### Test Case 4: Mixed
**Input:** `Produce Error If status in [A,B] and amount > 0`
**Expected:** `<Entity>:(status in ('A', 'B') && amount > 0)`

---

## User Guide Summary

**Quick Reference:**

| What You Type | What It Means |
|---------------|---------------|
| `field in (A,B,C)` | Field is one of: A, B, or C |
| `field in [A,B,C]` | Field is one of: A, B, or C |
| `field not in (A,B,C)` | Field is NOT any of: A, B, or C |
| `field not in [A,B,C]` | Field is NOT any of: A, B, or C |
| `field is in [A,B,C]` | Natural: Field is one of A, B, or C |
| `field is not in [A,B,C]` | Natural: Field is NOT any of A, B, or C |

---

## Date: 2026-02-12
## Status: Implemented and Ready for Testing
## Version: 1.1.0
