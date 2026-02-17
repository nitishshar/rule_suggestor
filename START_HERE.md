# 🚀 START HERE - Quick Testing Guide

## Immediate Actions

### 1. Start the Application
```bash
npm start
```
The app will open at `http://localhost:4200`

---

## 2. Test the New Features (5 Minutes)

### ✅ Test 1: New "is" Operator (30 seconds)
**In Classic View:**
1. Type: `Produce Error If Balance is 0`
2. Press Tab to accept autocomplete
3. Click "Save & Generate"
4. ✓ Should work without errors
5. ✓ Drools shows: `Balance == 0`

---

### ✅ Test 2: "populated" Operator (30 seconds)
1. Clear the editor
2. Type: `Produce Error If Contract Identifier is populated`
3. Click "Save & Generate"
4. ✓ Should work
5. ✓ Drools shows: `Contract Identifier != null`

---

### ✅ Test 3: Data Element Comparison (30 seconds)
1. Clear the editor
2. Type: `Produce Error If Balance greater than Transaction Amount`
3. Click "Save & Generate"
4. ✓ Should work
5. ✓ Drools shows: `Balance > Transaction Amount` (not quoted!)

---

### ✅ Test 4: Brackets for Lists (30 seconds)
1. Clear the editor
2. Type: `Produce Error If status in [ACTIVE,CLOSED]`
3. Click "Save & Generate"
4. ✓ Should work
5. ✓ Drools shows: `status in ('ACTIVE', 'CLOSED')`

---

### ✅ Test 5: Side-by-Side Editor (2 minutes)
1. Click **"Side by Side"** button at top
2. Click ❓ icon to see examples
3. Click any example card
4. ✓ Both panels should populate
5. Click on the right (Drools) panel
6. ✓ Drools should update
7. Click 📋 icon (left panel) for quick examples
8. Click ℹ️ icon for help text
9. Try copying Drools with 📋 (right panel)

---

### ✅ Test 6: Pattern Suggestions (1 minute)
1. Switch back to Classic View
2. Type incomplete rule: `Produce Error If Balance greater than`
3. Click "Save & Generate"
4. ✓ Should save (even though incomplete)
5. ✓ Warning appears with pattern suggestions
6. ✓ Red border on textarea
7. Click "Dismiss" on warning
8. ✓ Red border remains

---

## 3. Explore All New Operators

### Quick Tests

**Type these in Classic View and click "Save & Generate":**

```
✅ Produce Error If Contract Identifier present
✅ Produce Error If Account Number is present
✅ Produce Error If Balance is null or blank
✅ Produce Error If status is in [ACTIVE,CLOSED]
✅ Produce Error If status is not in (INVALID,TEST)
✅ Produce Error If Balance is 0 and Status is ACTIVE
✅ Produce Error If Balance > Transaction Amount
```

**All should work without errors!**

---

## 4. What to Look For

### ✅ Expected Behavior

**Autocomplete:**
- Suggestions appear as you type
- Tab accepts suggestion
- Arrow keys navigate
- Escape closes

**Validation:**
- Red border when issues exist
- Warnings can be dismissed
- Still allows saving
- Clear error messages

**Drools Generation:**
- Classic View: Click "Save & Generate"
- Side-by-Side: Focus on right panel
- Proper syntax in output
- Parentheses preserved

### ❌ Report If You See

**Problems:**
- Autocomplete not appearing
- Operators not recognized
- Drools generation errors
- UI display issues
- Console errors

---

## 5. Browser DevTools

### Open Console (F12)

**Check for:**
- Red error messages
- Failed network requests
- JavaScript exceptions

**Should be clean** (no errors during normal use)

---

## 6. Quick Feature Reference

| Feature | Location | How to Test |
|---------|----------|-------------|
| New operators | Classic View | Type "populated", "is", "is in" |
| Comparisons | Both views | Type "Balance > Transaction Amount" |
| Brackets | Both views | Type "status in [A,B]" |
| Pattern suggestions | Classic View | Save incomplete rule |
| Smart autocomplete | Both views | Type "gr" after data element |
| Side-by-side editor | Top navigation | Click "Side by Side" button |
| Real-time Drools | Side-by-side | Focus on right panel |
| Examples | Side-by-side | Click ❓ or 📋 icons |
| Dismissible warnings | Classic View | Dismiss any warning |
| Red border | Classic View | Create incomplete rule |

---

## 7. Common Issues & Solutions

### Issue: Autocomplete Not Showing
**Solution:** Make sure you're typing after "Produce Error If" and cursor is in the field.

### Issue: Router Errors on Startup
**Solution:** Router package should be installed automatically. App uses simple tab switcher now (no routing).

### Issue: Drools Not Generating in Side-by-Side
**Solution:** Make sure to **click/focus** on the Drools field (right panel).

### Issue: Examples Not Loading
**Solution:** Verify config.json loaded (check Network tab in DevTools).

---

## 8. Screenshots to Verify

### Classic View Should Show:
- Single textarea for rules
- "Save & Generate" button
- Validation warnings with dismiss buttons
- Red border when issues exist
- Pattern suggestions panel (when applicable)
- Generated Drools below
- Info icon (ⓘ) for examples

### Side-by-Side View Should Show:
- Two panels side-by-side
- Left: Logical Rule Statement (with 📋 ℹ️ icons)
- Right: DROOLS Rule Expression (with 📋 icon)
- Top: ❓ and 🗑️ icons
- Navigation: "Classic View" and "Side by Side" buttons
- Real-time generation on focus

---

## 9. Performance Check

### Should be Fast
- Typing → Instant autocomplete (<50ms)
- Save → Instant generation (<100ms)
- Focus Drools → Instant generation (<100ms)
- Switch views → Instant (<50ms)

### If Slow
- Check browser console
- Close other applications
- Try in incognito mode
- Check system resources

---

## 10. Final Validation

### ✅ Checklist Before Reporting Complete

- [ ] App starts without errors
- [ ] Classic View loads correctly
- [ ] Side-by-Side View loads correctly
- [ ] Can type in both editors
- [ ] Autocomplete works
- [ ] All new operators work
- [ ] Data element comparisons work
- [ ] Brackets work for lists
- [ ] Pattern suggestions appear
- [ ] Warnings are dismissible
- [ ] Drools generation works in both views
- [ ] Examples work in side-by-side
- [ ] Navigation between views works
- [ ] Theme toggle works
- [ ] No console errors

---

## 📚 Next Reading

**After basic testing:**
1. `QUICK_REFERENCE.md` - Learn all operators
2. `SIDEBYSIDE_EDITOR.md` - Deep dive into new editor
3. `TESTING_GUIDE.md` - Comprehensive testing
4. `IMPLEMENTATION_COMPLETE.md` - Full feature list

---

## 💬 Feedback

**If everything works:**
Great! Proceed with comprehensive testing using `TESTING_GUIDE.md`

**If issues found:**
1. Note the exact steps to reproduce
2. Check browser console for errors
3. Document expected vs actual behavior
4. Report with screenshots if possible

---

## 🎉 You're All Set!

**Everything is implemented and ready.**

Just run `npm start` and start testing! 🚀

---

*Quick Start Guide v1.0*
*Last Updated: 2026-02-12*
*Estimated Testing Time: 5-10 minutes*
