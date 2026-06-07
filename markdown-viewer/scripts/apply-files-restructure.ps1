# Eenmalig: Files/-corpus herschikken volgens Files/nieuwe structuur.md
$ErrorActionPreference = 'Stop'
$base = Resolve-Path (Join-Path $PSScriptRoot '..\..\Files')
Set-Location $base

function Ensure-DirFull([string]$fullPath) {
  if (-not (Test-Path -LiteralPath $fullPath)) {
    New-Item -ItemType Directory -Force -Path $fullPath | Out-Null
  }
}

function Move-PairMd([string]$relFrom, [string]$relTo) {
  $fromPath = Join-Path $base $relFrom
  $toPath = Join-Path $base $relTo
  if (-not (Test-Path -LiteralPath $fromPath)) {
    Write-Host "SKIP missing: $relFrom"
    return
  }
  Ensure-DirFull (Split-Path $toPath -Parent)
  Move-Item -LiteralPath $fromPath -Destination $toPath -Force

  $reviewsRoot = Join-Path $base '.reviews'
  $revFrom = Join-Path $reviewsRoot ($relFrom + '.json')
  $revTo = Join-Path $reviewsRoot ($relTo + '.json')
  if (Test-Path -LiteralPath $revFrom) {
    Ensure-DirFull (Split-Path $revTo -Parent)
    Move-Item -LiteralPath $revFrom -Destination $revTo -Force
  }
}

@(
  '00-index',
  '01-managed-services/contract',
  '01-managed-services/bijlagen',
  '01-managed-services/dienstbeschrijvingen',
  '01-managed-services/handouts/_legacy',
  '01-managed-services/confluence-md',
  '01-managed-services/overig',
  '02-projecten/euroconsumers',
  '02-projecten/firan',
  '02-projecten/dhl',
  '02-projecten/stanley-stella',
  '02-projecten/campus-utrecht',
  '03-persoonlijk-werk/gespreksverslagen',
  '03-persoonlijk-werk/rol-teamlead',
  '90-experiments-en-test',
  '99-prive'
) | ForEach-Object { Ensure-DirFull (Join-Path $base $_) }

# Testen/VTCBeach → privé (als nog aanwezig)
Move-PairMd 'Testen/VTCBeach.md' '99-prive/VTC_Beach_Toernooi_Preparatie.md'

Get-ChildItem -LiteralPath (Join-Path $base 'Testen') -ErrorAction SilentlyContinue | ForEach-Object {
  Move-PairMd ('Testen/' + $_.Name) ('90-experiments-en-test/' + $_.Name)
}
Remove-Item -LiteralPath (Join-Path $base 'Testen') -Recurse -Force -ErrorAction SilentlyContinue

Move-PairMd 'Juridisch_Contract_Managed_Services.md' '01-managed-services/contract/Juridisch_Contract_Managed_Services.md'

foreach ($pair in @(
  @('Bijlage_A_Scope_Managed_Services.md','01-managed-services/bijlagen/Bijlage_A_Scope_Managed_Services.md'),
  @('Bijlage_B_SLA_Standaard.md','01-managed-services/bijlagen/Bijlage_B_SLA_Standaard.md'),
  @('Bijlage_C_Componenten_URLs_en_infrastructuur.md','01-managed-services/bijlagen/Bijlage_C_Componenten_URLs_en_infrastructuur.md'),
  @('Bijlage_D_Prijs_en_facturatie.md','01-managed-services/bijlagen/Bijlage_D_Prijs_en_facturatie.md'),
  @('Small.md','01-managed-services/bijlagen/Small.md'),
  @('Applicatie_Dienstverlening.md','01-managed-services/dienstbeschrijvingen/Applicatie_Dienstverlening.md'),
  @('Cloud_Dienstverlening.md','01-managed-services/dienstbeschrijvingen/Cloud_Dienstverlening.md'),
  @('Dienstbeschrijving_Template_iO_Managed_Services.md','01-managed-services/dienstbeschrijvingen/Dienstbeschrijving_Template_iO_Managed_Services.md'),
  @('Appendix 1 - General Services NL.md','01-managed-services/dienstbeschrijvingen/Appendix_1_General_Services_NL.md'),
  @('Documentstructuur_Managed_Services.md','01-managed-services/overig/Documentstructuur_Managed_Services.md'),
  @('iO_SLA_Overzicht.md','01-managed-services/overig/iO_SLA_Overzicht.md'),
  @('iO App en Cloud.md','01-managed-services/overig/iO_App_en_Cloud.md'),
  @('Template_Confluence_Domeinpagina.md','01-managed-services/overig/Template_Confluence_Domeinpagina.md')
)) {
  Move-PairMd $pair[0] $pair[1]
}

Get-ChildItem -LiteralPath (Join-Path $base 'Confluence') -Filter '*.md' -ErrorAction SilentlyContinue | ForEach-Object {
  Move-PairMd ('Confluence/' + $_.Name) ('01-managed-services/confluence-md/' + $_.Name)
}
Remove-Item -LiteralPath (Join-Path $base 'Confluence') -Recurse -Force -ErrorAction SilentlyContinue

Move-PairMd 'Onderwerp_handouts_overzicht.md' '01-managed-services/handouts/Onderwerp_handouts_overzicht.md'
Move-PairMd 'Service_Desk.md' '01-managed-services/handouts/_legacy/Service_Desk.md'
Move-PairMd 'Informatiebeveiliging_en_Security_Team.md' '01-managed-services/handouts/_legacy/Informatiebeveiliging_en_Security_Team.md'

foreach ($pair in @(
  @('Euroconsumers_DXP_Programme_Lifecycle_Gantt.md','02-projecten/euroconsumers/Euroconsumers_DXP_Programme_Lifecycle_Gantt.md'),
  @('Euroconsumers_RFP_QA_Managed_Services.md','02-projecten/euroconsumers/Euroconsumers_RFP_QA_Managed_Services.md'),
  @('Euroconsumers_RFP_QA_Managed_Services_revised.md','02-projecten/euroconsumers/Euroconsumers_RFP_QA_Managed_Services_revised.md'),
  @('Bonzai QA.md','02-projecten/euroconsumers/Bonzai_QA_Euroconsumers_DXP.md'),
  @('Application Maintenance Agreement - StanleyStella - 2026.md','02-projecten/stanley-stella/Application_Maintenance_Agreement_StanleyStella_2026.md'),
  @('Beheerovereenkomst_Firan.md','02-projecten/firan/Beheerovereenkomst_Firan.md'),
  @('DHL Parcel SLA Addendum.md','02-projecten/dhl/DHL_Parcel_SLA_Addendum.md'),
  @('De Creatieve Ruimte – iO Campus Utrecht.md','02-projecten/campus-utrecht/De_Creatieve_Ruimte_iO_Campus_Utrecht.md'),
  @('de-creatieve-ruimte.md','02-projecten/campus-utrecht/de-creatieve-ruimte.md')
)) {
  Move-PairMd $pair[0] $pair[1]
}

foreach ($pair in @(
  @('Template gespreksverslag.md','03-persoonlijk-werk/gespreksverslagen/Template_Gespreksverslag.md'),
  @('Bila Sieto.md','03-persoonlijk-werk/gespreksverslagen/2026-05-18_Bila_Sieto.md'),
  @('Kennismaking Alex.md','03-persoonlijk-werk/gespreksverslagen/2026-05-18_Kennismaking_Alexander_de_Haas.md'),
  @('2026-05-19 Proudwall-and-Creative-Room-In_.md','03-persoonlijk-werk/gespreksverslagen/2026-05-19_Proudwall_and_Creative_Room_Innovatie_Campus.md'),
  @('Gespreksverslag voorbeeld.md','03-persoonlijk-werk/gespreksverslagen/2026-05-xx_Gespreksverslag_Voorbeeld.md'),
  @('Werk.md','03-persoonlijk-werk/rol-teamlead/Werk.md')
)) {
  Move-PairMd $pair[0] $pair[1]
}

foreach ($f in @('Test van Joost.md','Nieuwe test.md','testgespreksverslag.md','AGI Eng.md','OpenHuman.md')) {
  Move-PairMd $f ('90-experiments-en-test/' + $f)
}

Move-PairMd 'test.md' '99-prive/Menukaart_Restaurant_De_Gouden_Lepel.md'

Move-PairMd 'Voortuin.md' '99-prive/Voortuin.md'
Move-PairMd 'team ranking.md' '99-prive/VTC_Woerden_Teamranking_2023.md'
Move-PairMd 'tevredenheid VTC.md' '99-prive/VTC_Woerden_Tevredenheid_Dwarsdoorsnede_2023.md'
Move-PairMd 'nevobo-api.md' '99-prive/Nevobo_API_Technische_Documentatie.md'

Write-Host 'Done.'
