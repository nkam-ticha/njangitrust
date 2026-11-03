// Demo data (spec 5.5): "Njangi des Collègues" and "Njangi du quartier". Built in Phase 9 once
// every module exists; demo logins with known PINs only when NODE_ENV=development.
if (process.env.NODE_ENV !== 'development') {
  process.stderr.write('The demo seed only runs with NODE_ENV=development.\n');
  process.exit(1);
}
process.stdout.write('Demo seed not written yet (spec 5.5, Phase 9).\n');
