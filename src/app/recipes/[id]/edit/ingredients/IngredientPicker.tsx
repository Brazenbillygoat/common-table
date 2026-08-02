"use client";

import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";

import styles from "./ingredient-stage.module.scss";

type IngredientOption = {
  id: string;
  name: string;
};

type IngredientPickerProps = {
  errorId?: string;
  inputId: string;
  invalid: boolean;
  onChooseCustom: () => void;
  onQueryChange: (query: string) => void;
  onSelect: (id: string, name: string) => void;
  options: IngredientOption[];
  query: string;
  selectedId: string;
};

export function IngredientPicker({
  errorId,
  inputId,
  invalid,
  onChooseCustom,
  onQueryChange,
  onSelect,
  options,
  query,
  selectedId,
}: IngredientPickerProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const optionElements = useRef(new Map<string, HTMLLIElement>());
  const listboxId = `${inputId}-listbox`;
  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return normalizedQuery
      ? options.filter((option) => option.name.toLocaleLowerCase().includes(normalizedQuery))
      : options;
  }, [options, query]);
  const activeOption = activeIndex >= 0 ? filteredOptions[activeIndex] : undefined;

  useEffect(() => {
    if (!activeOption) return;
    const element = optionElements.current.get(activeOption.id);
    element?.scrollIntoView?.({ block: "nearest" });
  }, [activeOption]);

  function choose(option: IngredientOption) {
    onQueryChange(option.name);
    onSelect(option.id, option.name);
    setOpen(false);
    setActiveIndex(-1);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      if (filteredOptions.length > 0) {
        setActiveIndex((current) => (current + 1) % filteredOptions.length);
      }
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      if (filteredOptions.length > 0) {
        setActiveIndex((current) => (current <= 0 ? filteredOptions.length - 1 : current - 1));
      }
    } else if (event.key === "Enter" && open && activeOption) {
      event.preventDefault();
      choose(activeOption);
    } else if (event.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
    } else if (event.key === "Tab") {
      setOpen(false);
      setActiveIndex(-1);
    }
  }

  return (
    <div className={styles.picker}>
      <label htmlFor={inputId}>Ingredient</label>
      <div className={styles.pickerControl}>
        <input
          aria-activedescendant={
            open && activeOption ? `${inputId}-option-${activeOption.id}` : undefined
          }
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-describedby={errorId}
          aria-expanded={open}
          aria-invalid={invalid}
          id={inputId}
          onChange={(event) => {
            onQueryChange(event.target.value);
            setActiveIndex(-1);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Search ingredient list"
          role="combobox"
          type="text"
          value={query}
        />
        {open && filteredOptions.length > 0 ? (
          <ul className={styles.pickerList} id={listboxId} role="listbox">
            {filteredOptions.map((option, index) => (
              <li
                aria-selected={option.id === selectedId}
                className={index === activeIndex ? styles.pickerOptionActive : styles.pickerOption}
                id={`${inputId}-option-${option.id}`}
                key={option.id}
                onClick={() => choose(option)}
                onMouseDown={(event) => event.preventDefault()}
                ref={(element) => {
                  if (element) optionElements.current.set(option.id, element);
                  else optionElements.current.delete(option.id);
                }}
                role="option"
              >
                {option.name}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <button className={styles.textAction} onClick={onChooseCustom} type="button">
        Enter another ingredient
      </button>
    </div>
  );
}
