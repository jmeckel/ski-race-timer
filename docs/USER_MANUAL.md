# Ski Race Timer - User Manual

**GPS-Synchronized Race Timing for Ski Events**

Version 3.4 | Last Updated: January 2026

---

## Table of Contents

1. [Introduction](#introduction)
2. [Getting Started](#getting-started)
   - [First-Time Setup](#first-time-setup)
   - [Installing as an App](#installing-as-an-app)
3. [Timer View](#timer-view)
   - [Recording Times](#recording-times)
   - [Using the Number Pad](#using-the-number-pad)
   - [Timing Points (Start/Finish)](#timing-points)
   - [Run Selection (Run 1/Run 2)](#run-selection)
4. [Results View](#results-view)
   - [Viewing Entries](#viewing-entries)
   - [Searching and Filtering](#searching-and-filtering)
   - [Editing Entries](#editing-entries)
   - [Deleting Entries](#deleting-entries)
   - [Exporting Results](#exporting-results)
5. [Settings](#settings)
   - [Simple Mode vs Full Mode](#simple-mode-vs-full-mode)
   - [Cloud Sync](#cloud-sync)
   - [Photo Capture](#photo-capture)
   - [GPS Sync](#gps-sync)
   - [Feedback Options](#feedback-options)
   - [Language](#language)
6. [Multi-Device Synchronization](#multi-device-synchronization)
   - [Setting Up Sync](#setting-up-sync)
   - [Race Management](#race-management)
   - [PIN Protection](#pin-protection)
7. [Tips & Best Practices](#tips--best-practices)
8. [Troubleshooting](#troubleshooting)
9. [Keyboard Shortcuts](#keyboard-shortcuts)

---

## Introduction

Ski Race Timer is a professional-grade timing application designed for ski races and similar sporting events. It works as a Progressive Web App (PWA), meaning it can be installed on any device and works offline.

### Key Features

- **GPS-synchronized timing** for accurate, consistent timestamps across devices
- **Multi-device sync** to coordinate start and finish timers
- **Multi-run support** - Run 1/Run 2 selection for two-run races
- **Offline-first design** - works without internet, syncs when connected
- **Photo capture** - optional photo documentation for each timestamp
- **Export to Race Horology** - industry-standard CSV format
- **Bilingual support** - English and German interfaces

---

## Getting Started

### First-Time Setup

When you first open Ski Race Timer, an onboarding wizard guides you through initial setup:

#### Step 1: Welcome & Language
- Choose your preferred language: **Deutsch** or **English**
- This setting applies to the entire app

#### Step 2: Name Your Timer
- Enter a name for this device (e.g., "Start Timer", "Finish Line 1")
- This name identifies your device when syncing with others
- A random name is suggested (e.g., "Alpine Peak 42") - tap the refresh button to generate a new one
- You can also type any custom name

#### Step 3: Photo Documentation
- Choose whether to enable automatic photo capture
- When enabled, a photo is taken each time you record a timestamp
- **Why use photos?**
  - Verify bib numbers in case of disputes
  - Document finish line crossings
  - Evidence for race officials
- Photo capture is **off by default** - enable only if needed
- Can be changed later in Settings

#### Step 4: Join a Race (Optional)
- **Race ID**: Enter a unique identifier for your race (e.g., "WINTERCUP-2026")
  - If the race already exists, you'll see "Race found" with the entry count
  - If it's new, you'll see "New race"
  - **Quick-Select**: Tap the clock icon next to the input to see recently synced races from today - tap any race to fill in the ID automatically
- **PIN**: Enter a 4-digit PIN to secure the race
- **Enable Cloud Sync**: Toggle on to sync with other devices
- You can skip this step and configure it later in Settings

#### Step 5: Ready to Time
- Review your configuration summary:
  - Device name
  - Photo capture status
  - Race ID
  - Cloud sync status
- Tap **Start Timing** to begin

> **Tip:** You can replay the setup wizard anytime from Settings → Show Tutorial

### Installing as an App

Ski Race Timer works best when installed as an app on your device:

**On iOS (iPhone/iPad):**
1. Open the app in Safari
2. Tap the Share button (square with arrow)
3. Scroll down and tap "Add to Home Screen"
4. Tap "Add"

**On Android:**
1. Open the app in Chrome
2. Tap the three-dot menu
3. Tap "Add to Home screen" or "Install app"
4. Confirm installation

**Benefits of installing:**
- Full-screen experience without browser UI
- Faster loading
- Works completely offline
- Appears in your app list

---

## Timer View

The Timer view is your main workspace for recording race times.

### Screen Layout

```
┌─────────────────────────────────┐
│  Ski Race Timer    [Sync] [GPS] │  ← Header with status indicators
├─────────────────────────────────┤
│                                 │
│         12:34:56.789            │  ← Live clock (updates every ms)
│                                 │
│    [Start]     [Finish]         │  ← Timing point selection
│         [R1]  [R2]              │  ← Run selection (Full Mode)
│                                 │
│    ┌─────────────────────┐      │
│    │    RECORD TIME      │      │  ← Big timestamp button
│    └─────────────────────┘      │
│                                 │
│    Last: 042 | Finish | 12:34   │  ← Last recorded entry
│                                 │
│         Bib: 043                │  ← Current bib number
│                                 │
│    ┌───┬───┬───┐               │
│    │ 1 │ 2 │ 3 │               │  ← Number pad
│    ├───┼───┼───┤               │
│    │ 4 │ 5 │ 6 │               │
│    ├───┼───┼───┤               │
│    │ 7 │ 8 │ 9 │               │
│    ├───┼───┼───┤               │
│    │ C │ 0 │ ⌫ │               │
│    └───┴───┴───┘               │
├─────────────────────────────────┤
│  [Timer]   [Results]  [Settings]│  ← Navigation tabs
└─────────────────────────────────┘
```

### Recording Times

1. **Enter the bib number** using the number pad
   - Numbers are displayed as 3 digits (e.g., "5" becomes "005")
   - Maximum 3 digits (000-999)

2. **Select the timing point**
   - **Start** (green): For when racers begin their run
   - **Finish** (red): For when racers cross the finish line

3. **Tap the big RECORD TIME button**
   - A confirmation overlay shows the recorded entry
   - The timestamp is captured to millisecond precision

### Using the Number Pad

| Button | Function |
|--------|----------|
| 0-9 | Enter bib digits |
| C | Clear entire bib number |
| ⌫ | Delete last digit |

### Timing Points

- **Start (S)**: Records when a racer leaves the start gate
- **Finish (F)**: Records when a racer crosses the finish line

In **Full Mode**, both buttons are visible. In **Simple Mode**, only Finish is shown.

### Run Selection

For multi-run races (e.g., slalom with two runs), use the run selector:

- **R1** (Run 1): First run of the race
- **R2** (Run 2): Second run of the race

The run selector appears only in **Full Mode**. In Simple Mode, all entries are recorded as Run 1.

**How it works:**
1. Select the run (R1 or R2) before recording times
2. The selected run is shown on each recorded entry
3. Entries are filtered/grouped by run in the Results view
4. Duplicate detection considers the run (same bib + point + run = duplicate)

> **Tip:** Switch to Run 2 after the first run is complete. All timers should be on the same run setting.

### Auto-Increment

When enabled (default), the bib number automatically increases by 1 after recording a **Finish** time. This speeds up timing when racers finish in order.

- Auto-increment only triggers on Finish, not Start
- If you need to re-record a bib, just enter it manually

### Duplicate Detection

If you record the same bib number, timing point, and run twice, a **yellow warning** appears. The entry is still recorded, but this alerts you to potential errors. Note: Recording the same bib for Run 1 and Run 2 is not a duplicate.

### Zero Bib Warning

Recording bib "000" triggers a verification warning, as this is often an accidental entry.

---

## Results View

The Results view shows all recorded entries and provides tools for management and export.

### Viewing Entries

Entries are displayed in a scrollable list, sorted by timestamp (newest first):

```
┌─────────────────────────────────┐
│  042  │  F  │  12:34:56.78  │ ✓ │
│  Start Timer                    │
└─────────────────────────────────┘
```

Each entry shows:
- **Bib number** (large, on the left)
- **Timing point** (S = Start, F = Finish)
- **Run indicator** (R1 or R2, in Full Mode only)
- **Timestamp** (HH:MM:SS.ss format)
- **Sync status** (✓ = synced to cloud)
- **Device name** (which timer recorded it)
- **Photo indicator** (camera icon if photo attached)

### Statistics Bar

At the top of the Results view:
- **Total**: Number of recorded entries
- **Racers**: Number of unique bib numbers
- **Finished**: Number of Finish entries (Full Mode only)

### Searching and Filtering

**Search by Bib:**
- Type in the search box to find specific bib numbers
- Matches partial numbers (e.g., "4" finds 004, 014, 040, etc.)

**Filter by Point:**
- All / Start / Finish

**Filter by Status:**
- All / OK / DNS / DNF / DSQ

### Editing Entries

1. Tap on any entry to open the edit dialog
2. You can modify:
   - **Bib number**: Change if entered incorrectly
   - **Run**: Change between Run 1 and Run 2 (Full Mode only)
   - **Status**: Set to OK, DNS, DNF, or DSQ

3. Tap **Save** to confirm changes

> **Note:** You cannot edit the timestamp or timing point. Delete and re-record if needed.

### Status Codes

| Code | Meaning | Description |
|------|---------|-------------|
| OK | Finished | Normal completion |
| DNS | Did Not Start | Racer didn't start their run |
| DNF | Did Not Finish | Racer started but didn't complete |
| DSQ | Disqualified | Racer was disqualified |

### Deleting Entries

**Single Entry:**
1. Swipe left on an entry, or
2. Tap to edit, then tap the delete icon

**Multiple Entries:**
1. Long-press an entry to enter selection mode
2. Tap additional entries to select them
3. Tap "Delete Selected" in the bar that appears

**All Entries:**
1. Tap the "Clear All" button (trash icon)
2. Confirm the deletion

> **Warning:** Deletions sync to all connected devices. Other timers will also lose these entries.

### Undo

Made a mistake? Tap the **Undo** button immediately after deleting to restore entries.

- Undo works for the most recent action
- Works for single deletions, multiple deletions, and clear all
- Also restores synced entries on other devices

### Exporting Results

Tap the **Export** button to download a CSV file compatible with Race Horology and other timing software.

**Export Format:**
```csv
Startnummer;Lauf;Messpunkt;Zeit;Status;Gerät
042;1;FT;12:34:56.78;OK;Finish Timer
041;2;ST;12:33:45.12;OK;Start Timer
```

**Column Details:**
| Column | Description |
|--------|-------------|
| Startnummer | Bib number |
| Lauf | Run number (1 or 2) |
| Messpunkt | ST (Start) or FT (Finish) |
| Zeit | Time in HH:MM:SS.ss format |
| Status | OK, DNS, DNF, or DSQ |
| Gerät | Device name that recorded the entry |

---

## Settings

Access Settings via the gear icon in the navigation bar.

### Simple Mode vs Full Mode

**Simple Mode** (default):
- Shows only essential controls
- Finish timing point only
- Fewer settings visible
- Best for single-point timing

**Full Mode**:
- All features visible
- Both Start and Finish timing points
- Run selection (Run 1 / Run 2) for multi-run races
- Run indicator in results list
- Advanced filtering in Results
- GPS settings visible
- Admin/race management options

Toggle: **Settings → Simple Mode**

### Cloud Sync

Enable cloud synchronization to share entries between multiple devices.

**Settings:**
- **Cloud Sync**: Master toggle for sync functionality
- **Race ID**: Unique identifier for your race
  - Tap the clock icon to quick-select from recently synced races
- **Device Name**: How this device appears to others
- **Sync Photos**: Also sync captured photos (uses more data)

When sync is active, you'll see a status indicator in the header:
- 🟢 **Connected**: Real-time sync active
- 🟡 **Syncing**: Data transfer in progress
- 🟠 **Offline**: Working locally, will sync when connected
- 🔴 **Error**: Sync problem (check connection)

### Photo Capture

When enabled, the app captures a photo each time you record a timestamp.

**Use cases:**
- Document racer at finish line
- Verify bib numbers
- Evidence for disputes

**Settings:**
- **Photo Capture**: Enable/disable camera
- **Sync Photos**: Share photos across devices (requires cloud sync)

Photos appear as thumbnails in the Results list. Tap to view full-size.

> **Note:** Photos under 500KB sync to cloud. Larger photos stay on the local device.

### GPS Sync

Uses your device's GPS to improve timestamp accuracy and synchronization.

When active:
- Timestamps use GPS-corrected time
- More consistent timing across devices
- Shows accuracy indicator in header

**Status Indicators:**
- 🟢 **GPS Active**: Good signal, high accuracy
- 🟡 **Searching**: Acquiring satellites
- 🔴 **Inactive**: GPS disabled or unavailable

> **Tip:** For best GPS accuracy, use the app outdoors with clear sky visibility.

### Feedback Options

**Haptic Feedback:**
- Vibration on button presses and confirmations
- Helps confirm actions without looking at screen
- Recommended for outdoor use with gloves

**Sound Feedback:**
- Audio beep on timestamp recording
- Confirms successful time capture
- Useful in noisy environments

### Language

Toggle between **Deutsch (DE)** and **English (EN)**.

All interface text, messages, and exports update immediately.

---

## Multi-Device Synchronization

Ski Race Timer excels at coordinating multiple timing devices for professional race management.

### Typical Setup

```
        ┌─────────────────┐
        │   Cloud Sync    │
        │   (Race ID:     │
        │   WINTERCUP-26) │
        └────────┬────────┘
                 │
     ┌───────────┼───────────┐
     │           │           │
     ▼           ▼           ▼
┌─────────┐ ┌─────────┐ ┌─────────┐
│ Start   │ │ Finish  │ │ Backup  │
│ Timer   │ │ Timer   │ │ Timer   │
│ (iPad)  │ │ (Phone) │ │ (Tablet)│
└─────────┘ └─────────┘ └─────────┘
```

### Setting Up Sync

**On the first device:**
1. Go to **Settings → Cloud Sync** (enable)
2. Enter a **Race ID** (e.g., "CLUB-RACE-2026")
3. Set a **PIN** (4 digits) - this secures your race
4. Enter a descriptive **Device Name** (e.g., "Start Gate")

**On additional devices:**
1. Enable **Cloud Sync**
2. Enter the **same Race ID**
3. Enter the **same PIN**
4. Give each device a unique name (e.g., "Finish Line")

All devices with matching Race ID and PIN will sync automatically.

### What Syncs

| Data | Syncs? |
|------|--------|
| Timing entries | ✓ Yes |
| Entry edits | ✓ Yes |
| Deletions | ✓ Yes |
| Photos (if enabled) | ✓ Yes |
| Settings | ✗ No (per-device) |
| Bib input | ✗ No (per-device) |

### Race Management

Access via **Settings → Admin → Manage Races** (Full Mode only)

Features:
- View all active races you have access to
- See entry counts and connected devices
- Delete races (clears all entries from all devices)

### PIN Protection

The 4-digit PIN:
- Required to join an existing race
- Prevents unauthorized access to race data
- Same PIN required on all syncing devices

**Setting/Changing PIN:**
1. Go to **Settings → Admin → Admin PIN**
2. Enter current PIN (if changing)
3. Enter new 4-digit PIN
4. Confirm the PIN

> **Important:** If you forget the PIN, you cannot join that race. Create a new race with a new ID.

---

## Tips & Best Practices

### Before Race Day

1. **Test your setup** with a few practice runs
2. **Charge all devices** fully
3. **Install the app** on all devices (works better than browser)
4. **Set up sync** and verify all devices connect
5. **Clear old entries** from previous events

### Race Day Setup

1. **Position devices** at start and finish
2. **Verify sync status** - all devices should show "Connected"
3. **Test with a forerunner** - record times and verify they appear on all devices
4. **Assign clear device names** (Start, Finish A, Finish B, etc.)

### During the Race

1. **Keep devices charged** - bring power banks
2. **Monitor sync status** - entries should sync within seconds
3. **Use auto-increment** for sequential finishers
4. **Check for duplicates** - yellow warnings indicate repeated entries
5. **Take photos** for close finishes or disputes

### After the Race

1. **Export results** from any synced device
2. **Verify entry counts** match across devices
3. **Review photos** if disputes arise
4. **Clear race data** before next event

### Offline Operation

If internet connectivity is lost:
- Continue recording times normally
- Entries are stored locally
- When connection returns, everything syncs automatically
- No data is lost

---

## Troubleshooting

### Sync Issues

**Problem: Entries not appearing on other devices**

Solutions:
1. Check that all devices have the same Race ID
2. Verify the PIN is correct on all devices
3. Check internet connectivity
4. Pull down on Results view to force refresh
5. Toggle Cloud Sync off and on

**Problem: "Sync error" status**

Solutions:
1. Check internet connection
2. Wait a moment and try again (may be rate-limited)
3. Verify PIN is correct
4. Close and reopen the app

### Camera Issues

**Problem: Photo capture not working**

Solutions:
1. Grant camera permission when prompted
2. Check that Photo Capture is enabled in Settings
3. On iOS, ensure the app isn't in "Desktop" view mode
4. Try reloading the app

### GPS Issues

**Problem: GPS not activating or low accuracy**

Solutions:
1. Ensure GPS is enabled in Settings
2. Grant location permission when prompted
3. Move outdoors with clear sky view
4. Wait 30-60 seconds for satellite acquisition
5. Some devices have poor GPS hardware

### General Issues

**Problem: App not loading or blank screen**

Solutions:
1. Clear browser cache
2. Uninstall and reinstall the PWA
3. Try a different browser
4. Check for JavaScript errors in browser console

**Problem: Error recovery dialog appeared**

If multiple errors occur, a recovery dialog may appear with options:
- **Dismiss**: Close the dialog and continue using the app
- **Reload**: Refresh the page to reset the app state

This typically happens due to:
1. Network connectivity issues during sync
2. Browser running low on memory
3. Temporary server issues

Your data is safe - the app stores entries locally before syncing.

**Problem: Data seems lost**

Solutions:
1. Check if you're on the correct Race ID
2. Data may be on a different device
3. Check browser localStorage isn't cleared
4. If synced, data may be recoverable from another device

---

## Keyboard Shortcuts

When using on a computer or with external keyboard:

| Shortcut | Action |
|----------|--------|
| Enter | Record timestamp (when on Timer view) |
| 0-9 | Enter bib number digits |
| Backspace | Delete last digit |
| Escape | Close modals |

---

## Support

**Report Issues:**
https://github.com/jmeckel/ski-race-timer/issues

**Version Information:**
Check current version in Settings (bottom of page)

---

*Ski Race Timer - Professional timing made simple.*
