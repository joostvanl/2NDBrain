import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const DEFAULT_TIMEOUT_MS = 30000;
const MAX_TIMEOUT_MS = 120000;

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function truncStr(value, max = 1000) {
  const s = String(value || "");
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

function normalizeIsoDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (isAmbiguousNumericDate(raw)) return "";
  const dmy = parseDutchDateLike(raw);
  if (dmy) return new Date(`${dmy}T00:00:00`).toISOString();
  const d = new Date(raw);
  return Number.isFinite(d.getTime()) ? d.toISOString() : "";
}

function normalizeDateOnly(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (isAmbiguousNumericDate(raw)) return "";
  const dmy = parseDutchDateLike(raw);
  if (dmy) return dmy;
  const d = new Date(raw.length <= 10 ? `${raw}T00:00:00` : raw);
  if (!Number.isFinite(d.getTime())) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function parseDutchDateLike(value) {
  const raw = String(value || "").trim();
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(raw);
  if (iso) return datePartsToIso(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const dmy = /^(\d{1,2})[-/](\d{1,2})(?:[-/](\d{2,4}))?$/.exec(raw);
  if (!dmy) return "";
  const now = new Date();
  const yearRaw = dmy[3] ? Number(dmy[3]) : now.getFullYear();
  const year = yearRaw < 100 ? 2000 + yearRaw : yearRaw;
  // Nederlandse notatie: dag-maand-jaar. Dit voorkomt 08-06 -> 6 augustus.
  return datePartsToIso(year, Number(dmy[2]), Number(dmy[1]));
}

function datePartsToIso(year, month, day) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return "";
  if (year < 1900 || year > 2200 || month < 1 || month > 12 || day < 1 || day > 31) return "";
  const d = new Date(year, month - 1, day);
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return "";
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function isAmbiguousNumericDate(value) {
  const m = /^(\d{1,2})[-/](\d{1,2})(?:[-/]\d{2,4})?$/.exec(String(value || "").trim());
  if (!m) return false;
  const first = Number(m[1]);
  const second = Number(m[2]);
  return first >= 1 && first <= 12 && second >= 1 && second <= 12;
}

function ambiguousDateError(value) {
  return outlookUnavailable(
    `Ambigue datum "${String(value || "").trim()}". Gebruik ISO-formaat YYYY-MM-DD, bijvoorbeeld 2026-06-08 voor 8 juni 2026.`,
  );
}

function normalizeAddressList(value) {
  if (Array.isArray(value)) {
    return value
      .map((v) => String(v || "").trim())
      .filter(Boolean)
      .slice(0, 50);
  }
  return String(value || "")
    .split(/[;,]/)
    .map((v) => v.trim())
    .filter(Boolean)
    .slice(0, 50);
}

function outlookUnavailable(reason) {
  return {
    ok: false,
    error: reason,
    userFacingInstruction:
      "Outlook-tools werken alleen lokaal op Windows met Outlook Desktop en het ingelogde Outlook-profiel.",
  };
}

function parseOutlookJsonOutput(text) {
  const raw = String(text || "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .trim();
  if (!raw) throw new Error("lege output");
  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(raw.slice(start, end + 1));
    }
    throw new Error("geen JSON-object gevonden");
  }
}

function decodeOutlookBodyFields(value) {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    for (const item of value) decodeOutlookBodyFields(item);
    return value;
  }
  if (value.bodyEncoding === "base64:utf8" && typeof value.bodySnippet === "string") {
    try {
      value.bodySnippet = Buffer.from(value.bodySnippet, "base64").toString("utf8");
      value.bodyEncoding = "";
    } catch {
      value.bodySnippet = "";
      value.bodyEncoding = "base64-decode-error";
    }
  }
  for (const child of Object.values(value)) {
    if (child && typeof child === "object") decodeOutlookBodyFields(child);
  }
  return value;
}

function powershellExecutable() {
  return process.env.OUTLOOK_POWERSHELL || process.env.POWERSHELL_EXE || "powershell.exe";
}

function outlookAllowStart() {
  return process.env.OUTLOOK_ALLOW_START === "1";
}

function managedCalendarName() {
  return String(process.env.OUTLOOK_MANAGED_CALENDAR_NAME || "2ndbrain").trim() || "2ndbrain";
}

const OUTLOOK_POWERSHELL = String.raw`
$ErrorActionPreference = "Stop"

function Read-InputPayload {
  $raw = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($env:IOMS_OUTLOOK_INPUT_B64))
  return $raw | ConvertFrom-Json
}

function Clean-Text([object]$Value, [int]$Max = 1000) {
  $s = [string]$Value
  if (-not $s) { return "" }
  $s = $s -replace "\r?\n", " "
  $s = $s -replace "[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]", " "
  $s = $s -replace "\s+", " "
  $s = $s.Trim()
  if ($s.Length -gt $Max) { return $s.Substring(0, $Max) + "..." }
  return $s
}

function Clean-BodyText([object]$Value, [int]$Max = 10000) {
  $s = [string]$Value
  if (-not $s) { return "" }
  $lf = [string][char]10
  $s = $s -replace "\r\n?", $lf
  $s = $s -replace "[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]", " "
  $s = $s -replace ("[ \t]+" + $lf), $lf
  $s = $s -replace ($lf + "[ \t]+"), $lf
  $s = $s.Trim()
  if ($s.Length -gt $Max) { return $s.Substring(0, $Max) + $lf + $lf + "...[afgekapt op $Max tekens]" }
  return $s
}

function Search-Terms([object]$Value) {
  $s = (Clean-Text $Value 500).ToLowerInvariant()
  if (-not $s) { return @() }
  $tokens = $s -split "[^\p{L}\p{N}@._+-]+" |
    Where-Object { $_ -and $_.Length -ge 2 } |
    Select-Object -Unique
  return @($tokens)
}

function Search-Score([object]$Text, [object]$Query) {
  $hay = (Clean-Text $Text 20000).ToLowerInvariant()
  $q = (Clean-Text $Query 500).ToLowerInvariant()
  if (-not $q) { return 1 }
  if (-not $hay) { return 0 }
  $terms = @(Search-Terms $q)
  if ($terms.Count -eq 0) { return 1 }
  $score = 0
  if ($hay.Contains($q)) { $score += 20 }
  foreach ($term in $terms) {
    if ($hay.Contains($term)) {
      $score += 4
      if ($term.Length -ge 5) { $score += 1 }
    }
  }
  return $score
}

function Mail-SearchText([object]$Item, [bool]$IncludeBodyForSearch) {
  $hay = ((Prop $Item "Subject" "") + " " + (Prop $Item "SenderName" "") + " " + (Prop $Item "SenderEmailAddress" "") + " " + (Prop $Item "To" "") + " " + (Prop $Item "CC" "") + " " + (Prop $Item "Categories" ""))
  if ($IncludeBodyForSearch) {
    try {
      $body = Clean-Text (Prop $Item "Body" "") 4000
      if ($body) { $hay = $hay + " " + $body }
    } catch {
      # Een enkel corrupt/groot Outlook-item mag de hele zoekactie niet breken.
    }
  }
  return $hay
}

function To-Base64Utf8([object]$Value) {
  $s = [string]$Value
  if (-not $s) { return "" }
  return [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($s))
}

function To-Iso([object]$Value) {
  if ($null -eq $Value) { return "" }
  try {
    $dt = [datetime]$Value
    if ($dt.Kind -eq [DateTimeKind]::Utc) {
      $dt = $dt.ToLocalTime()
    }
    # Outlook COM returns appointment/mail DateTime values as local clock times.
    # Treat Unspecified/Local as local instead of converting again, otherwise
    # summer-time dates shift by +2 hours in nl-NL.
    $local = [DateTime]::SpecifyKind($dt, [DateTimeKind]::Unspecified)
    $offset = [TimeZoneInfo]::Local.GetUtcOffset($local)
    return ([DateTimeOffset]::new($local, $offset)).ToString("o")
  } catch { return "" }
}

function To-OutlookDate([datetime]$Value) {
  if ($Value.Kind -eq [DateTimeKind]::Utc) {
    $Value = $Value.ToLocalTime()
  }
  return $Value.ToString("g", [Globalization.CultureInfo]::CurrentCulture)
}

function Prop([object]$Item, [string]$Name, [object]$Fallback = "") {
  try {
    $v = $Item.$Name
    if ($null -eq $v) { return $Fallback }
    return $v
  } catch {
    return $Fallback
  }
}

function Get-OutlookProcessHint {
  try {
    $procs = Get-Process OUTLOOK,olk,HxOutlook -ErrorAction SilentlyContinue |
      Select-Object ProcessName, Id, Path
    if (-not $procs) {
      return "Er draaien geen bekende Outlook-processen."
    }
    $items = @()
    foreach ($p in $procs) {
      $kind = "onbekend"
      if ($p.ProcessName -eq "olk" -or $p.ProcessName -eq "HxOutlook") {
        $kind = "nieuwe Outlook voor Windows (geen klassieke COM-automation)"
      } elseif ($p.ProcessName -eq "OUTLOOK") {
        $kind = "klassieke Outlook Desktop (COM verwacht)"
      }
      $items += ($p.ProcessName + " pid=" + $p.Id + " - " + $kind + " - " + $p.Path)
    }
    return ($items -join "; ")
  } catch {
    return "Outlook-procesdetectie mislukt."
  }
}

function Mail-ToObject([object]$Item, [bool]$IncludeBody, [int]$BodyMaxChars) {
  $body = ""
  if ($IncludeBody) {
    $body = Clean-BodyText (Prop $Item "Body" "") $BodyMaxChars
  } else {
    $body = ""
  }
  return [ordered]@{
    entryId = Clean-Text (Prop $Item "EntryID" "") 4000
    # StoreID is zeer lang en kan in sommige Outlook-stores JSON-output vervuilen.
    # EntryID is voldoende voor de lokale default-store read-back die iOMS gebruikt.
    storeId = ""
    subject = Clean-Text (Prop $Item "Subject" "") 300
    senderName = Clean-Text (Prop $Item "SenderName" "") 200
    senderEmail = Clean-Text (Prop $Item "SenderEmailAddress" "") 300
    receivedTime = To-Iso (Prop $Item "ReceivedTime" $null)
    sentOn = To-Iso (Prop $Item "SentOn" $null)
    lastModifiedTime = To-Iso (Prop $Item "LastModificationTime" $null)
    to = Clean-Text (Prop $Item "To" "") 500
    cc = Clean-Text (Prop $Item "CC" "") 500
    unread = [bool](Prop $Item "UnRead" $false)
    hasAttachments = [bool]((Prop $Item "Attachments" $null).Count -gt 0)
    importance = [int](Prop $Item "Importance" 1)
    categories = Clean-Text (Prop $Item "Categories" "") 300
    conversationId = Clean-Text (Prop $Item "ConversationID" "") 200
    conversationTopic = Clean-Text (Prop $Item "ConversationTopic" "") 300
    bodySnippet = $(if ($IncludeBody) { To-Base64Utf8 $body } else { "" })
    bodyEncoding = $(if ($IncludeBody) { "base64:utf8" } else { "" })
    bodyIncluded = [bool]$IncludeBody
  }
}

function Calendar-ToObject([object]$Item, [bool]$IncludeBody, [int]$BodyMaxChars) {
  $body = ""
  if ($IncludeBody) {
    $body = Clean-Text (Prop $Item "Body" "") $BodyMaxChars
  } else {
    $body = Clean-Text (Prop $Item "Body" "") 500
  }
  return [ordered]@{
    entryId = Clean-Text (Prop $Item "EntryID" "") 4000
    storeId = Clean-Text (Prop (Prop $Item "Parent" $null) "StoreID" "") 4000
    subject = Clean-Text (Prop $Item "Subject" "") 300
    start = To-Iso (Prop $Item "Start" $null)
    end = To-Iso (Prop $Item "End" $null)
    durationMinutes = [int](Prop $Item "Duration" 0)
    location = Clean-Text (Prop $Item "Location" "") 300
    organizer = Clean-Text (Prop $Item "Organizer" "") 200
    requiredAttendees = Clean-Text (Prop $Item "RequiredAttendees" "") 800
    optionalAttendees = Clean-Text (Prop $Item "OptionalAttendees" "") 800
    busyStatus = [int](Prop $Item "BusyStatus" 0)
    isRecurring = [bool](Prop $Item "IsRecurring" $false)
    categories = Clean-Text (Prop $Item "Categories" "") 300
    bodySnippet = $body
    bodyIncluded = [bool]$IncludeBody
  }
}

function Join-Recipients([object]$Value) {
  if ($null -eq $Value) { return "" }
  if ($Value -is [Array]) {
    return (($Value | ForEach-Object { [string]$_ }) -join "; ")
  }
  return [string]$Value
}

function Get-OutlookNamespace {
  try {
    $app = [Runtime.InteropServices.Marshal]::GetActiveObject("Outlook.Application")
  } catch {
    $hint = Get-OutlookProcessHint
    if ($env:IOMS_OUTLOOK_ALLOW_START -eq "1") {
      $app = New-Object -ComObject Outlook.Application
    } else {
      throw "Geen actieve klassieke Outlook COM-sessie gevonden. De nieuwe Outlook voor Windows (olk.exe) wordt niet ondersteund door deze lokale COM-tool. Gebruik klassieke Outlook Desktop / Outlook 365 classic en zorg dat iOMS onder dezelfde gebruiker en hetzelfde privilege-level draait. Gedetecteerd: $hint"
    }
  }
  return $app.Session
}

function Find-CalendarFolderByName([object]$Folders, [string]$Name) {
  if (-not $Folders -or -not $Name) { return $null }
  foreach ($folder in $Folders) {
    try {
      $folderName = [string](Prop $folder "Name" "")
      $defaultItemType = [int](Prop $folder "DefaultItemType" -1)
      if ($folderName -eq $Name -and $defaultItemType -eq 1) {
        return $folder
      }
      $childMatch = Find-CalendarFolderByName (Prop $folder "Folders" $null) $Name
      if ($null -ne $childMatch) { return $childMatch }
    } catch {
      # Sommige stores/folders zijn niet toegankelijk; sla die over.
    }
  }
  return $null
}

function Get-ManagedCalendarFolder([object]$Namespace, [string]$Name) {
  $folder = Find-CalendarFolderByName $Namespace.Folders $Name
  if ($null -eq $folder) {
    throw "Outlook-agenda '$Name' niet gevonden. Maak een agenda met exact deze naam aan en zorg dat klassieke Outlook hem ziet."
  }
  return $folder
}

function Search-Mail([object]$InputPayload) {
  $ns = Get-OutlookNamespace
  $folderName = [string]($InputPayload.folder)
  if (-not $folderName) { $folderName = "inbox" }
  $folderNameLower = $folderName.ToLowerInvariant()
  $folderId = 6
  $dateProp = "ReceivedTime"
  if ($folderNameLower -eq "sent") {
    $folderId = 5
    $dateProp = "SentOn"
  } elseif ($folderNameLower -eq "drafts" -or $folderNameLower -eq "concepten" -or $folderNameLower -eq "concept") {
    # 16 = olFolderDrafts. Concepten hebben geen ReceivedTime/SentOn; sorteer op laatste wijziging.
    $folderId = 16
    $dateProp = "LastModificationTime"
  }
  $folder = $ns.GetDefaultFolder($folderId)
  $items = $folder.Items
  $items.Sort("[" + $dateProp + "]", $true)

  $from = [datetime]$InputPayload.fromDate
  $to = [datetime]$InputPayload.toDate
  $restrict = "[" + $dateProp + "] >= '" + (To-OutlookDate $from) + "' AND [" + $dateProp + "] <= '" + (To-OutlookDate $to) + "'"
  $items = $items.Restrict($restrict)
  $items.Sort("[" + $dateProp + "]", $true)

  $query = Clean-Text $InputPayload.query 300
  $limit = [int]$InputPayload.limit
  $includeBody = [bool]$InputPayload.includeBody
  $includeBodyForSearch = [bool]$InputPayload.includeBodyForSearch
  $bodyMaxChars = [int]$InputPayload.bodyMaxChars
  $maxDurationMs = [int]$InputPayload.maxDurationMs
  if ($maxDurationMs -lt 5000) { $maxDurationMs = 24000 }
  $results = New-Object System.Collections.Generic.List[object]
  $scanned = 0
  $skippedErrors = 0
  $partial = $false
  $debugStarted = Get-Date
  foreach ($item in $items) {
    try {
      if ($null -eq $item) { continue }
      $elapsedMs = [int]((Get-Date) - $debugStarted).TotalMilliseconds
      if ($elapsedMs -ge $maxDurationMs) {
        $partial = $true
        break
      }
      $itemDate = [datetime](Prop $item $dateProp ([datetime]::MinValue))
      if ($itemDate -lt $from -or $itemDate -gt $to) { continue }
      $scanned += 1
      if ($scanned -gt 1500) { break }
      $hay = Mail-SearchText $item $includeBodyForSearch
      $score = Search-Score $hay $query
      if ($query -and $score -le 0) { continue }
      $obj = Mail-ToObject $item $includeBody $bodyMaxChars
      $obj["matchScore"] = [int]$score
      $results.Add($obj)
    } catch {
      $skippedErrors += 1
      continue
    }
  }
  $mailSortProp = $(if ($folderNameLower -eq "sent") { "sentOn" } elseif ($folderId -eq 16) { "lastModifiedTime" } else { "receivedTime" })
  $results = @($results | Sort-Object @{ Expression = { [int]($_["matchScore"]) }; Descending = $true }, @{ Expression = { [string]($_[$mailSortProp]) }; Descending = $true } | Select-Object -First $limit)
  return [ordered]@{ ok = $true; folder = $folderName; query = $query; fromDate = (To-Iso $from); toDate = (To-Iso $to); count = $results.Count; scanned = $scanned; skippedErrors = $skippedErrors; partial = $partial; results = $results }
}

function Read-Mail([object]$InputPayload) {
  $ns = Get-OutlookNamespace
  $entryId = [string]$InputPayload.entryId
  $storeId = [string]$InputPayload.storeId
  if (-not $entryId) { throw "entryId ontbreekt." }
  if ($storeId) { $item = $ns.GetItemFromID($entryId, $storeId) } else { $item = $ns.GetItemFromID($entryId) }
  return [ordered]@{ ok = $true; item = (Mail-ToObject $item $true ([int]$InputPayload.bodyMaxChars)) }
}

function Search-Calendar([object]$InputPayload) {
  $ns = Get-OutlookNamespace
  $folder = $ns.GetDefaultFolder(9)
  $items = $folder.Items
  $items.IncludeRecurrences = $true
  $items.Sort("[Start]")

  $from = [datetime]$InputPayload.fromDate
  $to = [datetime]$InputPayload.toDate
  $restrict = "[Start] <= '" + (To-OutlookDate $to) + "' AND [End] >= '" + (To-OutlookDate $from) + "'"
  $items = $items.Restrict($restrict)
  $items.Sort("[Start]")

  $query = Clean-Text $InputPayload.query 300
  $limit = [int]$InputPayload.limit
  $includeBody = [bool]$InputPayload.includeBody
  $bodyMaxChars = [int]$InputPayload.bodyMaxChars
  $results = New-Object System.Collections.Generic.List[object]
  $scanned = 0
  foreach ($item in $items) {
    if ($null -eq $item) { continue }
    $itemStart = [datetime](Prop $item "Start" ([datetime]::MinValue))
    $itemEnd = [datetime](Prop $item "End" ([datetime]::MinValue))
    if ($itemStart -gt $to -or $itemEnd -lt $from) { continue }
    $scanned += 1
    if ($scanned -gt 1500) { break }
    $hay = ((Prop $item "Subject" "") + " " + (Prop $item "Location" "") + " " + (Prop $item "Organizer" "") + " " + (Prop $item "RequiredAttendees" "") + " " + (Prop $item "Body" ""))
    $score = Search-Score $hay $query
    if ($query -and $score -le 0) { continue }
    $obj = Calendar-ToObject $item $includeBody $bodyMaxChars
    $obj["matchScore"] = [int]$score
    $results.Add($obj)
  }
  $results = @($results | Sort-Object @{ Expression = { [int]($_["matchScore"]) }; Descending = $true }, @{ Expression = { [string]($_["start"]) }; Descending = $false } | Select-Object -First $limit)
  return [ordered]@{ ok = $true; query = $query; fromDate = (To-Iso $from); toDate = (To-Iso $to); count = $results.Count; scanned = $scanned; results = $results }
}

function Search-ManagedCalendar([object]$InputPayload) {
  $ns = Get-OutlookNamespace
  $calendarName = [string]$InputPayload.calendarName
  $folder = Get-ManagedCalendarFolder $ns $calendarName
  $items = $folder.Items
  $items.IncludeRecurrences = $true
  $items.Sort("[Start]")

  $from = [datetime]$InputPayload.fromDate
  $to = [datetime]$InputPayload.toDate
  $restrict = "[Start] <= '" + (To-OutlookDate $to) + "' AND [End] >= '" + (To-OutlookDate $from) + "'"
  $items = $items.Restrict($restrict)
  $items.Sort("[Start]")

  $query = Clean-Text $InputPayload.query 300
  $limit = [int]$InputPayload.limit
  $includeBody = [bool]$InputPayload.includeBody
  $bodyMaxChars = [int]$InputPayload.bodyMaxChars
  $results = New-Object System.Collections.Generic.List[object]
  $scanned = 0
  foreach ($item in $items) {
    if ($null -eq $item) { continue }
    $itemStart = [datetime](Prop $item "Start" ([datetime]::MinValue))
    $itemEnd = [datetime](Prop $item "End" ([datetime]::MinValue))
    if ($itemStart -gt $to -or $itemEnd -lt $from) { continue }
    $scanned += 1
    if ($scanned -gt 1500) { break }
    $hay = ((Prop $item "Subject" "") + " " + (Prop $item "Location" "") + " " + (Prop $item "Body" ""))
    $score = Search-Score $hay $query
    if ($query -and $score -le 0) { continue }
    $obj = Calendar-ToObject $item $includeBody $bodyMaxChars
    $obj["matchScore"] = [int]$score
    $results.Add($obj)
  }
  $results = @($results | Sort-Object @{ Expression = { [int]($_["matchScore"]) }; Descending = $true }, @{ Expression = { [string]($_["start"]) }; Descending = $false } | Select-Object -First $limit)
  return [ordered]@{ ok = $true; calendarName = $calendarName; query = $query; fromDate = (To-Iso $from); toDate = (To-Iso $to); count = $results.Count; scanned = $scanned; results = $results }
}

function Create-ManagedCalendarEvent([object]$InputPayload) {
  $ns = Get-OutlookNamespace
  $calendarName = [string]$InputPayload.calendarName
  $folder = Get-ManagedCalendarFolder $ns $calendarName
  $item = $folder.Items.Add()
  $item.Subject = [string]$InputPayload.subject
  $item.Start = [datetime]$InputPayload.start
  $item.End = [datetime]$InputPayload.end
  $item.Location = [string]$InputPayload.location
  $item.Body = [string]$InputPayload.body
  $item.BusyStatus = [int]$InputPayload.busyStatus
  $item.ReminderSet = [bool]$InputPayload.reminderSet
  if ([bool]$InputPayload.reminderSet) {
    $item.ReminderMinutesBeforeStart = [int]$InputPayload.reminderMinutesBeforeStart
  }
  $item.Save()
  if ([bool]$InputPayload.display) {
    $item.Display($false)
  }
  $event = Calendar-ToObject $item $true 4000
  $event.calendarName = $calendarName
  $event.saved = $true
  $event.displayed = [bool]$InputPayload.display
  return [ordered]@{ ok = $true; calendarName = $calendarName; event = $event; message = "Afspraak is aangemaakt in de Outlook-agenda '$calendarName'." }
}

function Update-ManagedCalendarEvent([object]$InputPayload) {
  $ns = Get-OutlookNamespace
  $calendarName = [string]$InputPayload.calendarName
  $folder = Get-ManagedCalendarFolder $ns $calendarName
  $entryId = [string]$InputPayload.entryId
  $storeId = [string]$InputPayload.storeId
  if (-not $entryId) { throw "entryId ontbreekt voor 2ndbrain-agenda-update." }
  if ($storeId) { $item = $ns.GetItemFromID($entryId, $storeId) } else { $item = $ns.GetItemFromID($entryId) }
  if ($null -eq $item) { throw "Agenda-item niet gevonden." }
  $parent = Prop $item "Parent" $null
  $parentEntryId = Clean-Text (Prop $parent "EntryID" "") 4000
  $folderEntryId = Clean-Text (Prop $folder "EntryID" "") 4000
  if ($parentEntryId -and $folderEntryId -and $parentEntryId -ne $folderEntryId) {
    throw "Agenda-item staat niet in de beheerde Outlook-agenda '$calendarName'. Alleen 2ndbrain-items mogen worden beheerd."
  }
  if ([string]$InputPayload.subject) { $item.Subject = [string]$InputPayload.subject }
  if ([string]$InputPayload.start) { $item.Start = [datetime]$InputPayload.start }
  if ([string]$InputPayload.end) { $item.End = [datetime]$InputPayload.end }
  if ($null -ne $InputPayload.location) { $item.Location = [string]$InputPayload.location }
  if ($null -ne $InputPayload.body) { $item.Body = [string]$InputPayload.body }
  if ($null -ne $InputPayload.busyStatus) { $item.BusyStatus = [int]$InputPayload.busyStatus }
  if ($null -ne $InputPayload.reminderSet) {
    $item.ReminderSet = [bool]$InputPayload.reminderSet
    if ([bool]$InputPayload.reminderSet -and $null -ne $InputPayload.reminderMinutesBeforeStart) {
      $item.ReminderMinutesBeforeStart = [int]$InputPayload.reminderMinutesBeforeStart
    }
  }
  $item.Save()
  if ([bool]$InputPayload.display) {
    $item.Display($false)
  }
  $event = Calendar-ToObject $item $true 4000
  $event.calendarName = $calendarName
  $event.saved = $true
  $event.displayed = [bool]$InputPayload.display
  return [ordered]@{ ok = $true; calendarName = $calendarName; event = $event; message = "Afspraak is bijgewerkt in de Outlook-agenda '$calendarName'." }
}

function Create-Draft([object]$InputPayload) {
  $ns = Get-OutlookNamespace
  $app = $ns.Application
  $mail = $app.CreateItem(0)
  $mail.To = Join-Recipients $InputPayload.to
  $mail.CC = Join-Recipients $InputPayload.cc
  $mail.BCC = Join-Recipients $InputPayload.bcc
  $mail.Subject = [string]$InputPayload.subject
  if ([string]$InputPayload.htmlBody) {
    $mail.HTMLBody = [string]$InputPayload.htmlBody
  } else {
    $mail.Body = [string]$InputPayload.body
  }
  $mail.Save()
  if ([bool]$InputPayload.display) {
    $mail.Display($false)
  }
  return [ordered]@{
    ok = $true
    entryId = Clean-Text (Prop $mail "EntryID" "") 4000
    storeId = Clean-Text (Prop (Prop $mail "Parent" $null) "StoreID" "") 4000
    subject = Clean-Text (Prop $mail "Subject" "") 300
    to = Clean-Text (Prop $mail "To" "") 1000
    cc = Clean-Text (Prop $mail "CC" "") 1000
    bcc = Clean-Text (Prop $mail "BCC" "") 1000
    saved = $true
    displayed = [bool]$InputPayload.display
    message = "Conceptmail is aangemaakt in Outlook. De mail is niet verzonden."
  }
}

function Create-ReplyDraft([object]$InputPayload) {
  $ns = Get-OutlookNamespace
  $entryId = [string]$InputPayload.entryId
  $storeId = [string]$InputPayload.storeId
  if (-not $entryId) { throw "entryId ontbreekt voor reply draft." }
  if ($storeId) { $original = $ns.GetItemFromID($entryId, $storeId) } else { $original = $ns.GetItemFromID($entryId) }
  $reply = $original.Reply()
  if ([string]$InputPayload.htmlBody) {
    $existingHtml = [string](Prop $reply "HTMLBody" "")
    $reply.HTMLBody = ([string]$InputPayload.htmlBody) + "<br><br>" + $existingHtml
  } else {
    $existingBody = [string](Prop $reply "Body" "")
    $reply.Body = ([string]$InputPayload.body) + [Environment]::NewLine + [Environment]::NewLine + $existingBody
  }
  $reply.Save()
  if ([bool]$InputPayload.display) {
    $reply.Display($false)
  }
  return [ordered]@{
    ok = $true
    entryId = Clean-Text (Prop $reply "EntryID" "") 4000
    storeId = ""
    subject = Clean-Text (Prop $reply "Subject" "") 300
    to = Clean-Text (Prop $reply "To" "") 1000
    cc = Clean-Text (Prop $reply "CC" "") 1000
    saved = $true
    displayed = [bool]$InputPayload.display
    message = "Reply-conceptmail is aangemaakt in Outlook. De mail is niet verzonden."
  }
}

try {
  $inputPayload = Read-InputPayload
  switch ([string]$inputPayload.action) {
    "search_mail" { $out = Search-Mail $inputPayload }
    "read_mail" { $out = Read-Mail $inputPayload }
    "search_calendar" { $out = Search-Calendar $inputPayload }
    "search_managed_calendar" { $out = Search-ManagedCalendar $inputPayload }
    "create_managed_calendar_event" { $out = Create-ManagedCalendarEvent $inputPayload }
    "update_managed_calendar_event" { $out = Update-ManagedCalendarEvent $inputPayload }
    "create_draft" { $out = Create-Draft $inputPayload }
    "create_reply_draft" { $out = Create-ReplyDraft $inputPayload }
    default { throw "Onbekende Outlook-actie: $($inputPayload.action)" }
  }
  $out | ConvertTo-Json -Depth 8 -Compress
} catch {
  ([ordered]@{ ok = $false; error = [string]$_.Exception.Message }) | ConvertTo-Json -Depth 4 -Compress
}
`;

async function runOutlookPowerShell(input, options = {}) {
  if (process.platform !== "win32") {
    return outlookUnavailable("Outlook-tools zijn alleen beschikbaar op Windows.");
  }

  const timeoutMs = clampNumber(options.timeoutMs, 3000, MAX_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);
  const inputB64 = Buffer.from(JSON.stringify(input), "utf8").toString("base64");
  const scriptPath = path.join(os.tmpdir(), `ioms-outlook-${Date.now()}-${Math.random().toString(16).slice(2)}.ps1`);
  try {
    await fs.writeFile(scriptPath, OUTLOOK_POWERSHELL, "utf8");
  } catch (e) {
    return outlookUnavailable(`Tijdelijk Outlook PowerShell-script schrijven mislukt: ${e?.message || e}`);
  }

  return await new Promise((resolve) => {
    const child = spawn(
      powershellExecutable(),
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath],
      {
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
        env: {
          ...process.env,
          IOMS_OUTLOOK_INPUT_B64: inputB64,
          IOMS_OUTLOOK_ALLOW_START: outlookAllowStart() ? "1" : "0",
        },
      },
    );

    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      resolve(outlookUnavailable(`Outlook-query duurde te lang (${timeoutMs} ms).`));
    }, timeoutMs);
    const cleanup = async () => {
      await fs.unlink(scriptPath).catch(() => {});
    };

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      cleanup();
      resolve(outlookUnavailable(`PowerShell/Outlook starten mislukt: ${err.message || err}`));
    });
    child.on("close", () => {
      clearTimeout(timer);
      cleanup();
      const text = stdout.trim();
      if (!text) {
        resolve(outlookUnavailable(`Outlook-query gaf geen output.${stderr ? ` ${truncStr(stderr, 500)}` : ""}`));
        return;
      }
      try {
        resolve(decodeOutlookBodyFields(parseOutlookJsonOutput(text)));
      } catch (e) {
        resolve(
          outlookUnavailable(
            `Outlook-query gaf geen geldig JSON (${String(e?.message || e)}). stdout=${truncStr(text, 500)}${stderr ? ` stderr=${truncStr(stderr, 300)}` : ""}`,
          ),
        );
      }
    });
  });
}

export function outlookConfigPayload({ enabled = true } = {}) {
  return {
    ok: true,
    enabled: enabled && process.platform === "win32",
    platform: process.platform,
    method: "Outlook Desktop via PowerShell COM",
    allowStart: outlookAllowStart(),
    managedCalendarName: managedCalendarName(),
  };
}

export async function searchOutlookMailPayload(input = {}) {
  if (isAmbiguousNumericDate(input.fromDate) || isAmbiguousNumericDate(input.toDate)) {
    return ambiguousDateError(isAmbiguousNumericDate(input.fromDate) ? input.fromDate : input.toDate);
  }
  const now = new Date();
  const folderRaw = String(input.folder || "").trim().toLowerCase();
  const folder =
    folderRaw === "sent"
      ? "sent"
      : folderRaw === "drafts" || folderRaw === "concepten" || folderRaw === "concept"
        ? "drafts"
        : "inbox";
  // Concepten kunnen ouder zijn dan de standaard mailvensters; verruim de default naar 1 jaar.
  const defaultLookbackDays = folder === "drafts" ? 365 : 90;
  const fromDate = normalizeIsoDate(input.fromDate) || addDays(now, -defaultLookbackDays).toISOString();
  const toDate = normalizeIsoDate(input.toDate) || now.toISOString();
  const payload = {
    action: "search_mail",
    query: String(input.query || "").trim(),
    folder,
    fromDate,
    toDate,
    limit: clampNumber(input.limit, 1, 25, 10),
    includeBody: input.includeBody === true,
    includeBodyForSearch: input.includeBodyForSearch === true || input.includeBody === true,
    bodyMaxChars: clampNumber(input.bodyMaxChars, 500, 10000, 2500),
    maxDurationMs: clampNumber(input.maxDurationMs, 5000, 110000, 24000),
  };
  const result = await runOutlookPowerShell(payload, { timeoutMs: 30000 });
  if (
    result?.ok &&
    Number(result.count || 0) === 0 &&
    payload.query &&
    payload.includeBodyForSearch !== true
  ) {
    const bodySearchResult = await runOutlookPowerShell({
      ...payload,
      includeBodyForSearch: true,
    });
    if (bodySearchResult?.ok) {
      return {
        ...bodySearchResult,
        fallback: "body-search",
        initialMetadataSearch: { count: result.count || 0, scanned: result.scanned || 0 },
      };
    }
  }
  if (!result?.ok && payload.includeBody && /geen geldig JSON|JSON/i.test(String(result?.error || ""))) {
    return await runOutlookPowerShell({
      ...payload,
      includeBody: false,
      bodyMaxChars: 700,
    });
  }
  return result;
}

export async function readOutlookMailPayload(input = {}) {
  const entryId = String(input.entryId || "").trim();
  if (!entryId) return outlookUnavailable("entryId ontbreekt.");
  return await runOutlookPowerShell({
    action: "read_mail",
    entryId,
    storeId: String(input.storeId || "").trim(),
    bodyMaxChars: clampNumber(input.bodyMaxChars, 500, 120000, 60000),
  });
}

export async function searchOutlookCalendarPayload(input = {}) {
  if (isAmbiguousNumericDate(input.date) || isAmbiguousNumericDate(input.fromDate) || isAmbiguousNumericDate(input.toDate)) {
    return ambiguousDateError(input.date || input.fromDate || input.toDate);
  }
  let fromDate = normalizeIsoDate(input.fromDate);
  let toDate = normalizeIsoDate(input.toDate);
  const day = normalizeDateOnly(input.date);
  if ((!fromDate || !toDate) && day) {
    fromDate = new Date(`${day}T00:00:00`).toISOString();
    toDate = new Date(`${day}T23:59:59`).toISOString();
  }
  if (!fromDate || !toDate) {
    const now = new Date();
    fromDate = fromDate || addDays(now, -30).toISOString();
    toDate = toDate || addDays(now, 120).toISOString();
  }
  return await runOutlookPowerShell({
    action: "search_calendar",
    query: String(input.query || "").trim(),
    fromDate,
    toDate,
    limit: clampNumber(input.limit, 1, 50, 20),
    includeBody: input.includeBody === true,
    bodyMaxChars: clampNumber(input.bodyMaxChars, 500, 10000, 2500),
  });
}

export async function searchManagedOutlookCalendarPayload(input = {}) {
  if (isAmbiguousNumericDate(input.date) || isAmbiguousNumericDate(input.fromDate) || isAmbiguousNumericDate(input.toDate)) {
    return ambiguousDateError(input.date || input.fromDate || input.toDate);
  }
  let fromDate = normalizeIsoDate(input.fromDate);
  let toDate = normalizeIsoDate(input.toDate);
  const day = normalizeDateOnly(input.date);
  if ((!fromDate || !toDate) && day) {
    fromDate = new Date(`${day}T00:00:00`).toISOString();
    toDate = new Date(`${day}T23:59:59`).toISOString();
  }
  if (!fromDate || !toDate) {
    const now = new Date();
    fromDate = fromDate || addDays(now, -30).toISOString();
    toDate = toDate || addDays(now, 120).toISOString();
  }
  return await runOutlookPowerShell({
    action: "search_managed_calendar",
    calendarName: managedCalendarName(),
    query: String(input.query || "").trim(),
    fromDate,
    toDate,
    limit: clampNumber(input.limit, 1, 100, 50),
    includeBody: input.includeBody === true,
    bodyMaxChars: clampNumber(input.bodyMaxChars, 500, 10000, 2500),
  });
}

export async function createManagedOutlookCalendarEventPayload(input = {}) {
  if (isAmbiguousNumericDate(input.start) || isAmbiguousNumericDate(input.end)) {
    return ambiguousDateError(isAmbiguousNumericDate(input.start) ? input.start : input.end);
  }
  const subject = String(input.subject || "").replace(/\s+/g, " ").trim();
  const start = normalizeIsoDate(input.start);
  const end = normalizeIsoDate(input.end);
  const startMs = start ? new Date(start).getTime() : NaN;
  const endMs = end ? new Date(end).getTime() : NaN;
  if (!subject) return outlookUnavailable("Onderwerp is verplicht voor een 2ndbrain-agenda-afspraak.");
  if (!start || !end || !Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    return outlookUnavailable("Start en end zijn verplicht in ISO-formaat, bijvoorbeeld 2026-06-08T10:00:00+02:00.");
  }
  if (endMs <= startMs) return outlookUnavailable("Eindtijd moet na starttijd liggen.");
  return await runOutlookPowerShell(
    {
      action: "create_managed_calendar_event",
      calendarName: managedCalendarName(),
      subject,
      start,
      end,
      location: String(input.location || "").trim(),
      body: String(input.body || "").trim(),
      busyStatus: clampNumber(input.busyStatus, 0, 4, 2),
      reminderSet: input.reminderSet === true,
      reminderMinutesBeforeStart: clampNumber(input.reminderMinutesBeforeStart, 0, 10080, 15),
      display: input.display === true,
    },
    { timeoutMs: 45000 },
  );
}

export async function updateManagedOutlookCalendarEventPayload(input = {}) {
  if (isAmbiguousNumericDate(input.start) || isAmbiguousNumericDate(input.end)) {
    return ambiguousDateError(isAmbiguousNumericDate(input.start) ? input.start : input.end);
  }
  const entryId = String(input.entryId || "").trim();
  const start = input.start ? normalizeIsoDate(input.start) : "";
  const end = input.end ? normalizeIsoDate(input.end) : "";
  const startMs = start ? new Date(start).getTime() : NaN;
  const endMs = end ? new Date(end).getTime() : NaN;
  if (!entryId) return outlookUnavailable("entryId is verplicht om een 2ndbrain-agenda-afspraak te verplaatsen of bij te werken.");
  if (input.start && (!start || !Number.isFinite(startMs))) {
    return outlookUnavailable("Start moet ISO-formaat hebben, bijvoorbeeld 2026-06-08T10:00:00+02:00.");
  }
  if (input.end && (!end || !Number.isFinite(endMs))) {
    return outlookUnavailable("End moet ISO-formaat hebben, bijvoorbeeld 2026-06-08T10:30:00+02:00.");
  }
  if (start && end && endMs <= startMs) return outlookUnavailable("Eindtijd moet na starttijd liggen.");
  const payload = {
    action: "update_managed_calendar_event",
    calendarName: managedCalendarName(),
    entryId,
    storeId: String(input.storeId || "").trim(),
    display: input.display === true,
  };
  if (typeof input.subject === "string" && input.subject.trim()) payload.subject = input.subject.replace(/\s+/g, " ").trim();
  if (start) payload.start = start;
  if (end) payload.end = end;
  if (typeof input.location === "string") payload.location = input.location.trim();
  if (typeof input.body === "string") payload.body = input.body.trim();
  if (input.busyStatus != null) payload.busyStatus = clampNumber(input.busyStatus, 0, 4, 2);
  if (input.reminderSet != null) payload.reminderSet = input.reminderSet === true;
  if (input.reminderMinutesBeforeStart != null) {
    payload.reminderMinutesBeforeStart = clampNumber(input.reminderMinutesBeforeStart, 0, 10080, 15);
  }
  return await runOutlookPowerShell(payload, { timeoutMs: 45000 });
}

export async function createOutlookDraftPayload(input = {}) {
  const to = normalizeAddressList(input.to);
  const cc = normalizeAddressList(input.cc);
  const bcc = normalizeAddressList(input.bcc);
  const subject = String(input.subject || "").replace(/\s+/g, " ").trim();
  const body = String(input.body || "").trim();
  const htmlBody = String(input.htmlBody || "").trim();
  if (!to.length && !cc.length && !bcc.length) {
    return outlookUnavailable("Minimaal één ontvanger is verplicht voor een Outlook-concept.");
  }
  if (!subject) return outlookUnavailable("Onderwerp is verplicht voor een Outlook-concept.");
  if (!body && !htmlBody) return outlookUnavailable("Bodytekst is verplicht voor een Outlook-concept.");
  if (body.length > 50000) return outlookUnavailable("Bodytekst is te lang voor een Outlook-concept (max 50000 tekens).");
  if (htmlBody.length > 120000) return outlookUnavailable("HTML-body is te lang voor een Outlook-concept (max 120000 tekens).");
  return await runOutlookPowerShell(
    {
      action: "create_draft",
      to,
      cc,
      bcc,
      subject,
      body,
      htmlBody,
      display: input.display !== false,
    },
    { timeoutMs: 45000 },
  );
}

export async function createOutlookReplyDraftPayload(input = {}) {
  const entryId = String(input.entryId || "").trim();
  const storeId = String(input.storeId || "").trim();
  const body = String(input.body || "").trim();
  const htmlBody = String(input.htmlBody || "").trim();
  if (!entryId) return outlookUnavailable("entryId ontbreekt voor een Outlook reply-concept.");
  if (!body && !htmlBody) return outlookUnavailable("Bodytekst is verplicht voor een Outlook reply-concept.");
  if (body.length > 50000) return outlookUnavailable("Bodytekst is te lang voor een Outlook reply-concept (max 50000 tekens).");
  if (htmlBody.length > 120000) return outlookUnavailable("HTML-body is te lang voor een Outlook reply-concept (max 120000 tekens).");
  return await runOutlookPowerShell(
    {
      action: "create_reply_draft",
      entryId,
      storeId,
      body,
      htmlBody,
      display: input.display !== false,
    },
    { timeoutMs: 45000 },
  );
}
