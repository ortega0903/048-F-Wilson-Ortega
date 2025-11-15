import { test, expect, Page } from '@playwright/test';
import fs from 'fs';

const BASE_URL = 'https://buggy.justtestit.org';

// Credenciales de prueba (ajusta si tienes otras)
const TEST_USER = 'Dav0903';
// La contraseña actual del usuario (para login)
const TEST_PASS = '@Prueba321';
// Nueva contraseña que queremos establecer en algunos tests
const NEW_PASS = '@Prueba123';

/**
 * Helper reutilizable para login.
 * Usa selectores robustos y espera a que la navegación de login termine.
 */
async function login(page: Page): Promise<void> {
  // Probar varias rutas comunes de login primero
  const paths = ['/login', '/signin', '/account/login', '/user/login'];
  let foundLoginPage = false;
  for (const p of paths) {
    try {
      await page.goto(`${BASE_URL}${p}`, { waitUntil: 'domcontentloaded' });
      // esperar un posible campo de contraseña (hasta 3s)
      try {
        await page.waitForSelector('input[type="password"]', { timeout: 3000 });
        foundLoginPage = true;
        break;
      } catch {
        // continuar a siguiente ruta
      }
    } catch (e) {
      // ignore and try next
    }
  }

  // Si no encontramos una ruta directa, intentar desde la homepage con enlaces visibles
  if (!foundLoginPage) {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    const linkTexts = [/login/i, /sign in/i, /signin/i, /entrar/i, /iniciar sesión/i];
    for (const txt of linkTexts) {
      try {
        const link = page.getByRole('link', { name: txt });
        if (await link.count() > 0) {
          await link.first().click();
          await page.waitForLoadState('networkidle');
          try {
            await page.waitForSelector('input[type="password"]', { timeout: 3000 });
            foundLoginPage = true;
            break;
          } catch {
            // no password yet
          }
        }
      } catch (e) {
        // continue
      }
    }
  }

  // Último recurso: si aún no hay form, buscar inputs en la página actual
  if (!foundLoginPage) {
    const anyPwd = page.locator('input[type="password"]');
    if (await anyPwd.count() === 0) {
      throw new Error('No se encontraron formularios de login en la aplicación');
    }
  }

  // Encontrar y rellenar username y password con selectores comunes
  const usernameCandidates = ['input[name="login"]', 'input[name="username"]', 'input[name="user"]', 'input[id*="user"]', 'input[type="email"]', 'input[placeholder*="user"]', 'input[placeholder*="email"]'];
  const passwordCandidates = ['input[type="password"]', 'input[name*="pass"]', 'input[id*="pass"]'];

  let unameFilled = false;
  for (const sel of usernameCandidates) {
    try {
      await page.waitForSelector(sel, { timeout: 2000 });
      const loc = page.locator(sel).first();
      await loc.fill(TEST_USER);
      unameFilled = true;
      break;
    } catch {
      // next
    }
  }
  let pwdFilled = false;
  for (const sel of passwordCandidates) {
    try {
      await page.waitForSelector(sel, { timeout: 2000 });
      const loc = page.locator(sel).first();
      await loc.fill(TEST_PASS);
      pwdFilled = true;
      break;
    } catch {
      // next
    }
  }
  if (!unameFilled || !pwdFilled) {
    // Guardar artefactos para diagnóstico
    try {
      const debugDir = 'debug';
      if (!fs.existsSync(debugDir)) fs.mkdirSync(debugDir);
      const ts = Date.now();
      await page.screenshot({ path: `${debugDir}/login-${ts}.png`, fullPage: true }).catch(() => {});
      const html = await page.content();
      fs.writeFileSync(`${debugDir}/login-${ts}.html`, html, { encoding: 'utf8' });
    } catch (e) {
      // ignore errors writing debug
    }
    throw new Error('No se pudieron localizar los campos de login (username/password) — se generó información en /debug');
  }

  // Enviar el formulario: intentar button[type=submit] y botones por texto
  const submitSelectors = ['button[type="submit"]', 'button:has-text("Login")', 'button:has-text("Sign in")', 'button:has-text("Entrar")'];
  let submitted = false;
  for (const sel of submitSelectors) {
    try {
      const btn = page.locator(sel);
      if (await btn.count() > 0) {
        await btn.first().click();
        submitted = true;
        break;
      }
    } catch (e) {
      // continue
    }
  }
  if (!submitted) {
    // intentar enviar con Enter en password
    await page.locator('input[type="password"]').first().press('Enter');
  }

  // Esperar a que el login complete; si no aparece link 'profile', intentar navegar a /profile
  try {
    await expect(page.getByRole('link', { name: /profile/i })).toBeVisible({ timeout: 5000 });
  } catch (e) {
    await page.goto(`${BASE_URL}/profile`);
  }
}

/**
 * Rellena los campos de cambio de contraseña en el perfil:
 * - Current Password (obligatorio para guardar)
 * - New Password
 * - Confirm Password
 */
async function fillPasswordFields(page: Page, current: string, newPwd?: string): Promise<void> {
  const currentSelectors = [
    () => page.getByLabel(/current password/i),
    () => page.getByLabel(/current pwd/i),
    () => page.locator('input[name*="current"]'),
    () => page.locator('input[id*="current"]'),
    () => page.locator('input[name="password"]'),
  ];
  const newSelectors = [
    () => page.getByLabel(/new password/i),
    () => page.locator('input[name*="new"]'),
    () => page.locator('input[id*="new"]'),
  ];
  const confirmSelectors = [
    () => page.getByLabel(/confirm password/i),
    () => page.locator('input[name*="confirm"]'),
    () => page.locator('input[id*="confirm"]'),
  ];

  let filledCurrent = false;
  for (const s of currentSelectors) {
    try {
      const loc = s();
      if ((await loc.count()) > 0) {
        await loc.first().fill(current);
        filledCurrent = true;
        break;
      }
    } catch {
      // continue
    }
  }
  if (!filledCurrent) {
    // intentar selector genérico
    await page.fill('input[type="password"]', current).catch(() => {});
  }

  if (newPwd) {
    let filledNew = false;
    for (const s of newSelectors) {
      try {
        const loc = s();
        if ((await loc.count()) > 0) {
          await loc.first().fill(newPwd);
          filledNew = true;
          break;
        }
      } catch {
        // continue
      }
    }
    if (!filledNew) {
      // fallback: buscar segundo input password
      const pwds = page.locator('input[type="password"]');
      if ((await pwds.count()) > 1) {
        await pwds.nth(1).fill(newPwd).catch(() => {});
      }
    }

    // Confirm
    let filledConfirm = false;
    for (const s of confirmSelectors) {
      try {
        const loc = s();
        if ((await loc.count()) > 0) {
          await loc.first().fill(newPwd);
          filledConfirm = true;
          break;
        }
      } catch {
        // continue
      }
    }
    if (!filledConfirm) {
      const pwds = page.locator('input[type="password"]');
      if ((await pwds.count()) > 2) {
        await pwds.nth(2).fill(newPwd).catch(() => {});
      }
    }
  }
}

test.describe('Perfil de usuario - Actualización (Buggy Cars)', () => {
  test.beforeEach(async ({ page }: { page: Page }) => {
    // Loguearse y navegar directamente a la página de perfil
    await login(page);
    // Click en el enlace Profile para respetar el routing del SPA
    const profileLink = page.getByRole('link', { name: /profile/i });
    if (await profileLink.count() > 0) {
      await profileLink.first().click();
    } else {
      await page.goto(`${BASE_URL}/profile`);
    }
    // Asegurarnos de que el formulario de perfil esté visible; si no existe, guardar HTML/screenshot para diagnóstico
    const profileLocator = page.locator('form#profileForm, form[name="profile"]');
    try {
      await expect(profileLocator).toBeVisible({ timeout: 3000 });
    } catch (e) {
      try {
        const debugDir = 'debug';
        if (!fs.existsSync(debugDir)) fs.mkdirSync(debugDir);
        const ts = Date.now();
        await page.screenshot({ path: `${debugDir}/profile-${ts}.png`, fullPage: true }).catch(() => {});
        const html = await page.content();
        fs.writeFileSync(`${debugDir}/profile-${ts}.html`, html, { encoding: 'utf8' });
      } catch (e) {
        // ignore
      }
      // no lanzar aquí; dejamos que las pruebas manejen la ausencia del form más adelante
    }
  });

  // Helper flexible para rellenar campos del perfil: intenta getByLabel, después una lista de selectores, y por último
  // usa inputs de texto por índice si se pasa 'fallbackIndex'. Lanza error y guarda debug si no encuentra el campo.
  async function setField(page: Page, labelRegex: RegExp, selectors: string[], value: string, fallbackIndex?: number) {
    // 1) intentar label
    try {
      const byLabel = page.getByLabel(labelRegex);
      if (await byLabel.count() > 0) {
        await byLabel.first().fill(value);
        return;
      }
    } catch {
      // continue
    }

    // 2) intentar selectores provistos
    for (const sel of selectors) {
      try {
        await page.waitForSelector(sel, { timeout: 1000 });
        await page.locator(sel).first().fill(value);
        return;
      } catch {
        // continue
      }
    }

    // 3) fallback por índice en inputs de texto
    if (typeof fallbackIndex === 'number') {
      try {
        const inputs = page.locator('input[type="text"], input:not([type])');
        if (await inputs.count() > fallbackIndex) {
          await inputs.nth(fallbackIndex).fill(value);
          return;
        }
      } catch {
        // continue
      }
    }

    // diagnostico
    try {
      const debugDir = 'debug';
      if (!fs.existsSync(debugDir)) fs.mkdirSync(debugDir);
      const ts = Date.now();
      await page.screenshot({ path: `${debugDir}/setfield-${ts}.png`, fullPage: true }).catch(() => {});
      const html = await page.content();
      fs.writeFileSync(`${debugDir}/setfield-${ts}.html`, html, { encoding: 'utf8' });
    } catch (e) {
      // ignore
    }
    throw new Error(`No se pudo localizar el campo para ${labelRegex}`);
  }

  // CP-01 – Actualización exitosa de perfil con datos válidos
  // ID: CP-01
  // Descripción: Actualizar nombre, apellido, dirección, teléfono y hobby con datos válidos y contraseña válida.
  test('CP-01 - Actualización exitosa de perfil con datos válidos', async ({ page }: { page: Page }) => {
    const nombre = 'Juan';
    const apellido = 'Pérez';
    const direccion = 'Calle Falsa 123';
    const telefono = '+34123456789';
    const hobby = 'Automovilismo';
    const password = 'Prueba@123';

    // Rellenar campos usando helper setField
    await setField(page, /first name|name|nombre/i, ['input[name="firstName"]', 'input[id*="first"]'], nombre, 0);
    await setField(page, /last name|surname|apellido/i, ['input[name="lastName"]', 'input[id*="last"]'], apellido, 1);
    await setField(page, /address|dirección/i, ['input[name="address"]', 'input[id*="address"]'], direccion, 2);
    await setField(page, /phone|teléfono|telephone/i, ['input[name="phone"]', 'input[id*="phone"]'], telefono, 3);
    await setField(page, /hobby|interest/i, ['input[name="hobby"]', 'input[id*="hobby"]'], hobby, 4);

    // Rellenar campo de contraseña actual y nueva (si aplica)
    await fillPasswordFields(page, TEST_PASS, NEW_PASS);

    // Guardar cambios
    await page.getByRole('button', { name: /save|update|guardar/i }).click();

    // Verificar mensaje de éxito
    const success = page.getByText(/success|saved|actualizado/i);
    await expect(success).toBeVisible();

    // Refrescar y comprobar persistencia
    await page.reload();
    // Comprobar valores con varios localizadores
    const firstNameLoc = page.getByLabel(/first name|name|nombre/i);
    if (await firstNameLoc.count() > 0) {
      await expect(firstNameLoc).toHaveValue(nombre);
    } else {
      await expect(page.locator('input[name="firstName"]')).toHaveValue(nombre);
    }
    const lastNameLoc = page.getByLabel(/last name|surname|apellido/i);
    if (await lastNameLoc.count() > 0) {
      await expect(lastNameLoc).toHaveValue(apellido);
    } else {
      await expect(page.locator('input[name="lastName"]')).toHaveValue(apellido);
    }
  });

  // CP-02 – Validación de campo Nombre obligatorio
  // ID: CP-02
  // Descripción: El campo Nombre es obligatorio y no debe permitir guardar si está vacío.
  test('CP-02 - Validación de campo Nombre obligatorio', async ({ page }: { page: Page }) => {
    const apellido = 'González';
    const direccion = 'Av. Siempre Viva 742';
    const telefono = '+34111222333';
    const hobby = 'SimRacing';
    const password = 'Prueba@123';

    // Dejar nombre vacío
    await page.getByLabel(/first name|name|nombre/i).fill('').catch(async () => {
      await page.fill('input[name="firstName"]', '');
    });

    // Rellenar resto
    await page.getByLabel(/last name|surname|apellido/i).fill(apellido).catch(async () => {
      await page.fill('input[name="lastName"]', apellido);
    });
    await page.getByLabel(/address|dirección/i).fill(direccion).catch(async () => {
      await page.fill('input[name="address"]', direccion);
    });
    await page.getByLabel(/phone|teléfono|telephone/i).fill(telefono).catch(async () => {
      await page.fill('input[name="phone"]', telefono);
    });
    await page.getByLabel(/hobby|interest/i).fill(hobby).catch(async () => {
      await page.fill('input[name="hobby"]', hobby);
    });
    // Rellenar current password para poder guardar (si el formulario lo requiere)
    await fillPasswordFields(page, TEST_PASS);

    // Guardar
    await page.getByRole('button', { name: /save|update|guardar/i }).click();

    // Verificar que aparece mensaje de error indicando que nombre es obligatorio
    const nameError = page.getByText(/name.*required|nombre.*obligatorio|first name.*required/i);
    await expect(nameError).toBeVisible();

    // Asegurar que no se muestra mensaje de éxito
    const success = page.getByText(/success|saved|actualizado/i);
    await expect(success).not.toBeVisible();
  });

  // CP-03 – Validación de campo Apellido obligatorio
  // ID: CP-03
  // Descripción: El campo Apellido es obligatorio y no debe permitir guardar si está vacío.
  test('CP-03 - Validación de campo Apellido obligatorio', async ({ page }: { page: Page }) => {
    const nombre = 'Ana';
    const direccion = 'Pza. Mayor 1';
    const telefono = '+34987654321';
    const hobby = 'Karting';
    const password = 'Prueba@123';

    await page.getByLabel(/first name|name|nombre/i).fill(nombre).catch(async () => {
      await page.fill('input[name="firstName"]', nombre);
    });

    // Dejar apellido vacío
    await page.getByLabel(/last name|surname|apellido/i).fill('').catch(async () => {
      await page.fill('input[name="lastName"]', '');
    });

    // Rellenar resto
    await page.getByLabel(/address|dirección/i).fill(direccion).catch(async () => {
      await page.fill('input[name="address"]', direccion);
    });
    await page.getByLabel(/phone|teléfono|telephone/i).fill(telefono).catch(async () => {
      await page.fill('input[name="phone"]', telefono);
    });
    await page.getByLabel(/hobby|interest/i).fill(hobby).catch(async () => {
      await page.fill('input[name="hobby"]', hobby);
    });
    // Rellenar current password
    await fillPasswordFields(page, TEST_PASS);

    // Guardar
    await page.getByRole('button', { name: /save|update|guardar/i }).click();

    // Verificar error de apellido obligatorio
    const lastNameError = page.getByText(/last name.*required|apellido.*obligatorio/i);
    await expect(lastNameError).toBeVisible();

    // Verificar que no haya mensaje de éxito
    const success = page.getByText(/success|saved|actualizado/i);
    await expect(success).not.toBeVisible();
  });

  // CP-04 – Rechazo de contraseña con formato inválido
  // ID: CP-04
  // Descripción: La contraseña que no cumple las reglas debe ser rechazada.
  test('CP-04 - Rechazo de contraseña con formato inválido', async ({ page }: { page: Page }) => {
    const nombre = 'Carlos';
    const apellido = 'Lopez';
    const direccion = 'Calle 8';
    const telefono = '+34123400000';
    const hobby = 'Mecánica';
    const badPassword = 'prueba123'; // sin mayúscula ni símbolo

    await page.getByLabel(/first name|name|nombre/i).fill(nombre).catch(async () => {
      await page.fill('input[name="firstName"]', nombre);
    });
    await page.getByLabel(/last name|surname|apellido/i).fill(apellido).catch(async () => {
      await page.fill('input[name="lastName"]', apellido);
    });
    await page.getByLabel(/address|dirección/i).fill(direccion).catch(async () => {
      await page.fill('input[name="address"]', direccion);
    });
    await page.getByLabel(/phone|teléfono|telephone/i).fill(telefono).catch(async () => {
      await page.fill('input[name="phone"]', telefono);
    });
    await page.getByLabel(/hobby|interest/i).fill(hobby).catch(async () => {
      await page.fill('input[name="hobby"]', hobby);
    });

    // Ingresar contraseña inválida (en new password / confirm)
    await fillPasswordFields(page, TEST_PASS, badPassword);

    // Guardar
    await page.getByRole('button', { name: /save|update|guardar/i }).click();

    // Verificar mensaje de error sobre formato de contraseña
    const pwdError = page.getByText(/password.*(uppercase|mayúscula|special|carácter especial)|contraseña.*(mayúscula|especial)/i);
    await expect(pwdError).toBeVisible();

    // No debe haber mensaje de éxito
    const success = page.getByText(/success|saved|actualizado/i);
    await expect(success).not.toBeVisible();
  });

  // CP-05 – Actualización parcial (teléfono y hobby) y persistencia de datos
  // ID: CP-05
  // Descripción: Cambiar sólo teléfono y hobby y verificar persistencia sin tocar otros campos.
  test('CP-05 - Actualización parcial (teléfono y hobby) y persistencia', async ({ page }: { page: Page }) => {
    // Asumimos que el perfil ya estaba lleno; leemos los valores actuales
    const firstNameLocator = page.getByLabel(/first name|name|nombre/i).first();
    const lastNameLocator = page.getByLabel(/last name|surname|apellido/i).first();
    const addressLocator = page.getByLabel(/address|dirección/i).first();

    const originalFirstName = await firstNameLocator.inputValue().catch(async () => {
      return await page.locator('input[name="firstName"]').inputValue();
    });
    const originalLastName = await lastNameLocator.inputValue().catch(async () => {
      return await page.locator('input[name="lastName"]').inputValue();
    });
    const originalAddress = await addressLocator.inputValue().catch(async () => {
      return await page.locator('input[name="address"]').inputValue();
    });

    const newPhone = '+349000111222';
    const newHobby = 'Restauración';

    // Cambiar sólo teléfono y hobby
    await page.getByLabel(/phone|teléfono|telephone/i).fill(newPhone).catch(async () => {
      await page.fill('input[name="phone"]', newPhone);
    });
    await page.getByLabel(/hobby|interest/i).fill(newHobby).catch(async () => {
      await page.fill('input[name="hobby"]', newHobby);
    });

    // Algunos formularios requieren la contraseña actual para guardar cambios
    await fillPasswordFields(page, TEST_PASS);

    // Guardar
    await page.getByRole('button', { name: /save|update|guardar/i }).click();

    // Verificar mensaje de éxito
    const success = page.getByText(/success|saved|actualizado/i);
    await expect(success).toBeVisible();

    // Refrescar y verificar valores
    await page.reload();
    await expect(page.getByLabel(/phone|teléfono|telephone/i)).toHaveValue(newPhone).catch(async () => {
      await expect(page.locator('input[name="phone"]')).toHaveValue(newPhone);
    });
    await expect(page.getByLabel(/hobby|interest/i)).toHaveValue(newHobby).catch(async () => {
      await expect(page.locator('input[name="hobby"]')).toHaveValue(newHobby);
    });

    // Verificar que los otros campos no cambiaron
    await expect(page.getByLabel(/first name|name|nombre/i)).toHaveValue(originalFirstName);
    await expect(page.getByLabel(/last name|surname|apellido/i)).toHaveValue(originalLastName);
    await expect(page.getByLabel(/address|dirección/i)).toHaveValue(originalAddress);
  });
});
