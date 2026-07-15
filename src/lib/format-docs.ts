import { z } from 'zod';
import {
  SCHEMA_BY_FORMAT,
  CONTENT_KEYS_BY_FORMAT,
  servingBlockSchema,
  promoFormats,
  type PromoFormat,
} from './schema';
import { FORMAT_LABEL } from './format-labels';

/**
 * Генератор человекочитаемой документации по per-format zod-схемам
 * (`docs/promo-format-schemas.md`). Общая логика для `scripts/generate-format-docs.ts`
 * (запись файла) и `src/lib/format-docs.test.ts` (drift-тест: сравнивает
 * свежую генерацию с закоммиченным файлом).
 *
 * В schema.ts нет `.describe()`-аннотаций (осознанно — это не наш файл),
 * поэтому русские описания полей живут здесь, в FIELD_DESCRIPTIONS.
 */

/** Русские описания полей по "пути" (dot-path от корня схемы формата).
 *  Путь для вложенных объектов — `parent.child` (например `action.href`),
 *  для элементов массива объектов — `field[].child` (например `steps[].title`).
 *  Если пути нет в словаре — попадает под общий fallback по имени листового
 *  поля (см. FIELD_DESCRIPTIONS_BY_LEAF ниже). */
const FIELD_DESCRIPTIONS: Record<string, string> = {
  id: 'Уникальный идентификатор промо',
  name: 'Название промо для админки (не показывается юзеру)',
  title: 'Заголовок промо — обязателен для всех форматов, часть контракта BFF',
  startsAt: 'Дата и время начала показа',
  endsAt: 'Дата и время окончания показа',
  targeting: 'Таргетинг аудитории показа',
  'targeting.minAge': 'Минимальный возраст юзера',
  'targeting.maxAge': 'Максимальный возраст юзера',
  'targeting.regions': 'Список регионов показа (пусто = без ограничения)',
  'targeting.subscriptionLevels': 'Уровни подписки юзера, которым показывается промо',
  maxImpressionsPerUser: 'Лимит показов на юзера (пусто = без лимита)',
  cooldownHours: 'Пауза между повторными показами одному юзеру, часов',
  afterPromoId: 'Показывать только после того, как юзер видел указанное промо (id предшественника в цепочке)',
  audience: 'Аудитория: все / только авторизованные / только анонимные',
  sections: 'Список разделов сайта, где показывается промо',
  categories: 'Список категорий, где показывается промо',
  sellerStatus: 'Показывать только продавцам или только покупателям',
  deviceTarget: 'Устройства показа: десктоп / тач / оба',
  format: 'Тип промо-формата (определяет рендерер и набор контентных полей)',
  description: 'Текст описания промо',
  imageUrl: 'URL картинки промо',
  action: 'Кнопка призыва к действию (CTA)',
  'action.href': 'Ссылка перехода по клику на CTA-кнопку',
  'action.label': 'Подпись CTA-кнопки',
  ctaColor: 'Цвет фона CTA-кнопки (пусто = дефолт рендерера)',
  ctaTextColor: 'Цвет текста на CTA-кнопке (пусто = белый)',
  dismissible: 'Можно ли закрыть промо крестиком',
  backgroundColor: 'Цвет фона промо',
  textColor: 'Цвет текста промо',
  backgroundImage: 'URL фоновой картинки промо',
  backgroundGradient: 'Линейный градиент фона (каскадом с backgroundImage/backgroundColor)',
  'backgroundGradient.from': 'Начальный цвет градиента',
  'backgroundGradient.to': 'Конечный цвет градиента',
  'backgroundGradient.angle': 'Угол градиента, градусы (0–360)',
  textAlign: 'Горизонтальное выравнивание текста (left / center / right)',
  anchor: 'Якорь data-promo-anchor на странице — элемент, к которому привязан tooltip',
  steps: 'Шаги визарда (от 2 до 6)',
  'steps[].title': 'Заголовок шага (до 80 символов)',
  'steps[].body': 'Текст шага (до 240 символов)',
  'steps[].imageUrl': 'URL картинки/гифки шага (если пусто — показывается анимированная сцена хоста)',
  presentation: 'Режим показа визарда: модалка (modal, по умолчанию) или на весь экран (fullscreen)',
  divkitUrl: 'URL на JSON-вёрстку DivKit в S3 (production-вариант)',
  divkitJson: 'Инлайн JSON-вёрстка DivKit для превью до сохранения (в проде не хранится)',
  variant: 'Зарегистрированный host-компонент витрины (id из KNOWN_CUSTOM_VARIANTS)',
};

/** Краткое человеко-читаемое описание типа поля (для колонки «Тип» в таблице). */
function describeZodType(schema: z.ZodTypeAny): string {
  const def = (schema as unknown as { _def: Record<string, unknown> })._def;
  const typeName = def.typeName as string;

  switch (typeName) {
    case 'ZodString': {
      const checks = (def.checks as Array<{ kind: string }>) ?? [];
      if (checks.some((c) => c.kind === 'url')) return 'строка (URL)';
      if (checks.some((c) => c.kind === 'datetime')) return 'строка (ISO datetime)';
      return 'строка';
    }
    case 'ZodNumber':
      return 'число';
    case 'ZodBoolean':
      return 'булево';
    case 'ZodEnum': {
      // `|` — служебный разделитель колонок markdown-таблицы, поэтому
      // между значениями enum используем `/`, а не `|`.
      const values = (def.values as string[]) ?? [];
      return `enum(${values.join(' / ')})`;
    }
    case 'ZodLiteral':
      return `literal(${JSON.stringify(def.value)})`;
    case 'ZodArray': {
      const inner = describeZodType(def.type as z.ZodTypeAny);
      return `массив<${inner}>`;
    }
    case 'ZodObject':
      return 'объект (см. под-поля ниже)';
    case 'ZodUnknown':
      return 'произвольное значение (unknown)';
    default:
      return typeName.replace(/^Zod/, '');
  }
}

/** Снимает ZodOptional/ZodDefault/ZodEffects(preprocess) обёртки и
 *  возвращает "голую" схему + признак опциональности, собранный по цепочке. */
function unwrap(schema: z.ZodTypeAny): { inner: z.ZodTypeAny; optional: boolean } {
  let current = schema as unknown as { _def: Record<string, unknown> };
  let optional = false;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const typeName = current._def.typeName as string;
    if (typeName === 'ZodOptional') {
      optional = true;
      current = (current._def.innerType as { _def: Record<string, unknown> });
    } else if (typeName === 'ZodDefault') {
      optional = true;
      current = (current._def.innerType as { _def: Record<string, unknown> });
    } else if (typeName === 'ZodEffects') {
      // z.preprocess(...) — реальный тип лежит в _def.schema.
      current = (current._def.schema as { _def: Record<string, unknown> });
    } else {
      break;
    }
  }
  return { inner: current as unknown as z.ZodTypeAny, optional };
}

interface FieldRow {
  path: string;
  type: string;
  required: boolean;
  description: string;
}

/** Разворачивает одно поле схемы (и — рекурсивно — под-поля вложенных
 *  объектов/массивов объектов) в плоский список строк таблицы. */
function flattenField(key: string, rawSchema: z.ZodTypeAny, parentPath: string | null): FieldRow[] {
  const path = parentPath ? `${parentPath}.${key}` : key;
  const { inner, optional } = unwrap(rawSchema);
  const innerDef = (inner as unknown as { _def: Record<string, unknown> })._def;
  const typeName = innerDef.typeName as string;

  const description = FIELD_DESCRIPTIONS[path] ?? '—';
  const row: FieldRow = { path, type: describeZodType(inner), required: !optional, description };

  if (typeName === 'ZodObject') {
    const shape = (inner as z.ZodObject<any>).shape;
    const children = Object.entries(shape).flatMap(([childKey, childSchema]) =>
      flattenField(childKey, childSchema as z.ZodTypeAny, path),
    );
    return [row, ...children];
  }

  if (typeName === 'ZodArray') {
    const elementType = innerDef.type as z.ZodTypeAny;
    const { inner: elementInner } = unwrap(elementType);
    const elementDef = (elementInner as unknown as { _def: Record<string, unknown> })._def;
    if ((elementDef.typeName as string) === 'ZodObject') {
      const arrayPath = `${path}[]`;
      const shape = (elementInner as z.ZodObject<any>).shape;
      const children = Object.entries(shape).flatMap(([childKey, childSchema]) =>
        flattenField(childKey, childSchema as z.ZodTypeAny, arrayPath),
      );
      return [row, ...children];
    }
  }

  return [row];
}

function renderTable(rows: FieldRow[]): string {
  const header = '| Поле | Тип | Обязательность | Описание |\n|---|---|---|---|';
  const body = rows
    .map((r) => `| \`${r.path}\` | ${r.type} | ${r.required ? 'обязательно' : 'опционально'} | ${r.description} |`)
    .join('\n');
  return `${header}\n${body}`;
}

/** Формат-специфичные примечания об обязательности, которая проверяется не
 *  самой schema.ts-схемой, а формой/бизнес-логикой поверх неё. */
const FORMAT_NOTES: Partial<Record<PromoFormat, string[]>> = {
  tooltip: ['`anchor` — обязательное поле схемы (не просто форма): якорь должен существовать в CANONICAL_ANCHORS.'],
  multistep: ['`steps` — обязателен, от 2 до 6 шагов (ограничение схемы: `.min(2).max(6)`).'],
  custom: [
    '`variant` — обязателен и должен входить в `KNOWN_CUSTOM_VARIANTS` (проверяется `.refine()` в схеме).',
    'variant `referral-invite`: поля `referral*` (копейки/целые числа) не рендерятся на сайте — promo-bff зеркалит их (best-effort upsert) в abkhaz-Supabase `referral_config` (id=1) при сохранении промо.',
  ],
  divkit: [
    '`divkitUrl` и `divkitJson` оба опциональны в схеме (storage-контракт), но на форме обязателен хотя бы один из них: `divkitUrl || divkitJson`.',
  ],
};

/** Генерирует полный markdown-документ по текущим SCHEMA_BY_FORMAT/CONTENT_KEYS_BY_FORMAT. */
export function generateFormatDocs(): string {
  const lines: string[] = [];

  lines.push('<!-- сгенерировано скриптом scripts/generate-format-docs.ts, не редактировать руками -->');
  lines.push('<!-- команда: npm run docs:formats -->');
  lines.push('');
  lines.push('# Схемы промо-форматов');
  lines.push('');
  lines.push(
    'Справочник по полям каждого из 8 типов промо (`src/lib/schema.ts`, `SCHEMA_BY_FORMAT`/`CONTENT_KEYS_BY_FORMAT`). ' +
      'Документ описывает форму zod-схемы «как есть»: тип поля, обязательность на уровне схемы и русское описание назначения.',
  );
  lines.push('');

  lines.push('## Общие поля (serving) — одинаковы для всех форматов');
  lines.push('');
  lines.push(
    'Слой 1 схемы — таргетинг/расписание/частота показов. Именно эти поля BFF использует для отбора кандидата до рендера контента.',
  );
  lines.push('');
  const servingRows = Object.entries(servingBlockSchema.shape).flatMap(([key, schema]) =>
    flattenField(key, schema as z.ZodTypeAny, null),
  );
  lines.push(renderTable(servingRows));
  lines.push('');

  for (const format of promoFormats) {
    const label = FORMAT_LABEL[format];
    const schema = SCHEMA_BY_FORMAT[format];
    const contentKeys = CONTENT_KEYS_BY_FORMAT[format];

    lines.push(`## ${label.name} — ${label.sub}`);
    lines.push('');

    const notes = FORMAT_NOTES[format];
    if (notes) {
      for (const note of notes) lines.push(`> ${note}`);
      lines.push('');
    }

    if (contentKeys.length === 0) {
      lines.push('_У этого формата нет контентных полей сверх общего serving-блока._');
      lines.push('');
      continue;
    }

    const rows = contentKeys.flatMap((key) => flattenField(key, schema.shape[key], null));
    lines.push(renderTable(rows));
    lines.push('');
  }

  return `${lines.join('\n').trimEnd()}\n`;
}
