"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { AdminBusinessType } from "@/lib/admin/queries";
import {
  saveBusinessType,
  toggleBusinessType,
  deleteBusinessType,
} from "./actions";
import { Spinner } from "@/components/Spinner";
import admin from "../rafraf-admin.module.css";
import bt from "./business-types.module.css";

type FieldType = "text" | "number" | "date";
type CField = { key: string; type: FieldType; label_ar: string; label_en: string };
type FormState = {
  id?: string;
  slug: string;
  name_ar: string;
  name_en: string;
  active: boolean;
  sort: number;
  custom_fields: CField[];
};

type Labels = {
  add: string;
  edit: string;
  slug: string;
  slugHint: string;
  nameAr: string;
  nameEn: string;
  sort: string;
  active: string;
  fields: string;
  fieldKey: string;
  fieldType: string;
  fieldLabelAr: string;
  fieldLabelEn: string;
  addField: string;
  remove: string;
  save: string;
  saving: string;
  cancel: string;
  none: string;
  count: string; // "{n} fields"
  activate: string;
  deactivate: string;
  delete: string;
  deleteConfirm: string;
  types: { text: string; number: string; date: string };
  errors: Record<string, string>;
};

const NEW_FIELD: CField = { key: "", type: "text", label_ar: "", label_en: "" };

export function BusinessTypesManager({
  initial,
  labels,
  locale,
}: {
  initial: AdminBusinessType[];
  labels: Labels;
  locale: string;
}) {
  const router = useRouter();
  const [form, setForm] = useState<FormState | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const name = (r: AdminBusinessType) => (locale === "ar" ? r.name_ar : r.name_en);
  const err = (code?: string) => labels.errors[code ?? "failed"] ?? labels.errors.failed;

  const openNew = () => {
    setMsg(null);
    setForm({
      slug: "",
      name_ar: "",
      name_en: "",
      active: true,
      sort: initial.length + 1,
      custom_fields: [],
    });
  };
  const openEdit = (r: AdminBusinessType) => {
    setMsg(null);
    setForm({
      id: r.id,
      slug: r.slug,
      name_ar: r.name_ar,
      name_en: r.name_en,
      active: r.active,
      sort: r.sort,
      custom_fields: r.custom_fields.map((f) => ({ ...f })),
    });
  };

  const patch = (p: Partial<FormState>) => setForm((f) => (f ? { ...f, ...p } : f));
  const patchField = (i: number, p: Partial<CField>) =>
    setForm((f) =>
      f
        ? {
            ...f,
            custom_fields: f.custom_fields.map((cf, idx) =>
              idx === i ? { ...cf, ...p } : cf,
            ),
          }
        : f,
    );
  const addField = () =>
    setForm((f) =>
      f ? { ...f, custom_fields: [...f.custom_fields, { ...NEW_FIELD }] } : f,
    );
  const removeField = (i: number) =>
    setForm((f) =>
      f ? { ...f, custom_fields: f.custom_fields.filter((_, idx) => idx !== i) } : f,
    );

  const onSave = () => {
    if (!form) return;
    start(async () => {
      const r = await saveBusinessType(form);
      if (r.ok) {
        setForm(null);
        setMsg(null);
        router.refresh();
      } else {
        setMsg(err(r.error));
      }
    });
  };
  const onToggle = (r: AdminBusinessType) =>
    start(async () => {
      const res = await toggleBusinessType(r.id, !r.active);
      if (res.ok) router.refresh();
      else setMsg(err(res.error));
    });
  const onDelete = (r: AdminBusinessType) => {
    if (!window.confirm(labels.deleteConfirm)) return;
    start(async () => {
      const res = await deleteBusinessType(r.id, r.slug);
      if (res.ok) router.refresh();
      else setMsg(err(res.error));
    });
  };

  return (
    <div className={admin.section}>
      {!form && (
        <div className={admin.controlRow}>
          <button type="button" className={admin.btnPrimary} onClick={openNew}>
            {labels.add}
          </button>
          {msg && <span className={admin.status}>{msg}</span>}
        </div>
      )}

      {form && (
        <div className={admin.panel}>
          <div className={bt.formGrid}>
            <div className={bt.field}>
              <label className={bt.lbl} htmlFor="bt-slug">
                {labels.slug}
              </label>
              <input
                id="bt-slug"
                className={admin.input}
                value={form.slug}
                disabled={!!form.id || pending}
                placeholder="e.g. bakery"
                onChange={(e) =>
                  patch({
                    slug: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""),
                  })
                }
              />
            </div>
            <div className={bt.field}>
              <label className={bt.lbl} htmlFor="bt-ar">
                {labels.nameAr}
              </label>
              <input
                id="bt-ar"
                className={admin.input}
                value={form.name_ar}
                disabled={pending}
                onChange={(e) => patch({ name_ar: e.target.value })}
              />
            </div>
            <div className={bt.field}>
              <label className={bt.lbl} htmlFor="bt-en">
                {labels.nameEn}
              </label>
              <input
                id="bt-en"
                className={admin.input}
                dir="ltr"
                value={form.name_en}
                disabled={pending}
                onChange={(e) => patch({ name_en: e.target.value })}
              />
            </div>
            <div className={bt.field}>
              <label className={bt.lbl} htmlFor="bt-sort">
                {labels.sort}
              </label>
              <input
                id="bt-sort"
                className={admin.input}
                type="number"
                dir="ltr"
                value={form.sort}
                disabled={pending}
                onChange={(e) => patch({ sort: Number(e.target.value) || 0 })}
              />
            </div>
          </div>

          {!form.id && <p className={admin.status}>{labels.slugHint}</p>}

          <label className={bt.checkRow}>
            <input
              type="checkbox"
              checked={form.active}
              disabled={pending}
              onChange={(e) => patch({ active: e.target.checked })}
            />
            {labels.active}
          </label>

          <div>
            <div className={admin.controlRow}>
              <strong>{labels.fields}</strong>
              <button
                type="button"
                className={admin.btn}
                disabled={pending}
                onClick={addField}
              >
                {labels.addField}
              </button>
            </div>
            <div className={bt.fields}>
              {form.custom_fields.map((f, i) => (
                <div key={i} className={bt.fieldRow}>
                  <input
                    className={bt.cell}
                    placeholder={labels.fieldKey}
                    value={f.key}
                    disabled={pending}
                    onChange={(e) =>
                      patchField(i, {
                        key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""),
                      })
                    }
                  />
                  <select
                    className={bt.cell}
                    value={f.type}
                    disabled={pending}
                    onChange={(e) =>
                      patchField(i, { type: e.target.value as FieldType })
                    }
                  >
                    <option value="text">{labels.types.text}</option>
                    <option value="number">{labels.types.number}</option>
                    <option value="date">{labels.types.date}</option>
                  </select>
                  <input
                    className={bt.cell}
                    placeholder={labels.fieldLabelAr}
                    value={f.label_ar}
                    disabled={pending}
                    onChange={(e) => patchField(i, { label_ar: e.target.value })}
                  />
                  <input
                    className={bt.cell}
                    placeholder={labels.fieldLabelEn}
                    dir="ltr"
                    value={f.label_en}
                    disabled={pending}
                    onChange={(e) => patchField(i, { label_en: e.target.value })}
                  />
                  <button
                    type="button"
                    className={admin.btn}
                    disabled={pending}
                    onClick={() => removeField(i)}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className={admin.controlRow}>
            <button
              type="button"
              className={admin.btnPrimary}
              disabled={pending}
              onClick={onSave}
            >
              {pending ? (
                <>
                  <Spinner />
                  {labels.saving}
                </>
              ) : (
                labels.save
              )}
            </button>
            <button
              type="button"
              className={admin.btn}
              disabled={pending}
              onClick={() => {
                setForm(null);
                setMsg(null);
              }}
            >
              {labels.cancel}
            </button>
            {msg && <span className={admin.status}>{msg}</span>}
          </div>
        </div>
      )}

      {initial.length === 0 ? (
        <p className={admin.empty}>{labels.none}</p>
      ) : (
        <div className={admin.tableWrap}>
          <table className={admin.table}>
            <tbody>
              {initial.map((r) => (
                <tr key={r.id}>
                  <td>{name(r)}</td>
                  <td className={admin.muted} dir="ltr">
                    {r.slug}
                  </td>
                  <td>
                    <span
                      className={`${admin.pill} ${r.active ? admin.pillOk : admin.pillBad}`}
                    >
                      {r.active ? labels.active : "—"}
                    </span>
                  </td>
                  <td className={admin.muted}>
                    {labels.count.replace("{n}", String(r.custom_fields.length))}
                  </td>
                  <td>
                    <div className={admin.controlRow}>
                      <button
                        type="button"
                        className={admin.btn}
                        disabled={pending}
                        onClick={() => openEdit(r)}
                      >
                        {labels.edit}
                      </button>
                      <button
                        type="button"
                        className={admin.btn}
                        disabled={pending}
                        onClick={() => onToggle(r)}
                      >
                        {r.active ? labels.deactivate : labels.activate}
                      </button>
                      <button
                        type="button"
                        className={admin.btn}
                        disabled={pending}
                        onClick={() => onDelete(r)}
                      >
                        {labels.delete}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
