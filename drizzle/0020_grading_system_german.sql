-- The per-program grading-system selector was removed: percent results plus the
-- editable grade scale (Notenmatrix) replace it. Normalize legacy values so
-- formatGrade renders consistently; pass/fail now lives on the module.
UPDATE "degree_program" SET "grading_system" = 'german' WHERE "grading_system" <> 'german';
