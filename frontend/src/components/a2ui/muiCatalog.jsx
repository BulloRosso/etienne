import React from 'react';
import { Box, Typography, Button as MuiButton, TextField as MuiTextField } from '@mui/material';
import { Catalog } from '@a2ui/web_core/v0_9';
import {
  basicCatalog,
  createComponentImplementation,
} from '@a2ui/react/v0_9';
import {
  TextApi,
  RowApi,
  ColumnApi,
  ButtonApi,
  TextFieldApi,
  DateTimeInputApi,
} from '@a2ui/web_core/v0_9/basic_catalog';

const INPUT_MAX_WIDTH = 350;

/**
 * MUI-themed implementations for the 5 components used by the
 * a2ui-restaurant-booking demo. Drop-in replacements for basicCatalog's
 * Text/Column/Button/TextField/DateTimeInput.
 *
 * The `props` callback param is the A2UI generic-binder's resolved view —
 * BoundValues are already resolved to scalars, action callbacks are wired,
 * and TextField/DateTimeInput receive a setValue setter that writes back
 * into the surface's data model.
 */

const MuiText = createComponentImplementation(TextApi, ({ props }) => {
  const text = typeof props.text === 'string' ? props.text : String(props.text ?? '');
  const variant = props.variant || 'body';
  const muiVariant = {
    h1: 'h4',
    h2: 'h5',
    h3: 'h6',
    h4: 'subtitle1',
    h5: 'subtitle2',
    caption: 'caption',
    body: 'body1',
  }[variant] || 'body1';
  return (
    <Typography variant={muiVariant} sx={{ flex: typeof props.weight === 'number' ? props.weight : undefined }}>
      {text}
    </Typography>
  );
});

const MuiColumn = createComponentImplementation(ColumnApi, ({ props, buildChild }) => {
  const justify = mapJustify(props.justify);
  const align = mapAlign(props.align);
  const children = Array.isArray(props.children) ? props.children : [];
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: justify,
        alignItems: align,
        gap: 1.5,
        flex: typeof props.weight === 'number' ? props.weight : undefined,
      }}
    >
      {children.map((id) => (
        <React.Fragment key={id}>{buildChild(id)}</React.Fragment>
      ))}
    </Box>
  );
});

const MuiRow = createComponentImplementation(RowApi, ({ props, buildChild }) => {
  const justify = mapJustify(props.justify);
  const align = mapAlign(props.align);
  const children = Array.isArray(props.children) ? props.children : [];
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'row',
        justifyContent: justify,
        alignItems: align,
        gap: 1.5,
        flex: typeof props.weight === 'number' ? props.weight : undefined,
      }}
    >
      {children.map((id) => (
        <React.Fragment key={id}>{buildChild(id)}</React.Fragment>
      ))}
    </Box>
  );
});

const MuiButtonImpl = createComponentImplementation(ButtonApi, ({ props, buildChild }) => {
  const variant = props.variant === 'primary'
    ? 'contained'
    : props.variant === 'borderless'
    ? 'text'
    : 'outlined';
  return (
    <MuiButton
      variant={variant}
      color="primary"
      onClick={props.action}
      disabled={props.isValid === false}
    >
      {props.child ? buildChild(props.child) : null}
    </MuiButton>
  );
});

const MuiTextFieldImpl = createComponentImplementation(TextFieldApi, ({ props }) => {
  const isLong = props.variant === 'longText';
  const type = props.variant === 'number'
    ? 'number'
    : props.variant === 'obscured'
    ? 'password'
    : 'text';
  const hasError = props.validationErrors && props.validationErrors.length > 0;
  return (
    <MuiTextField
      label={props.label}
      type={type}
      multiline={isLong}
      minRows={isLong ? 3 : undefined}
      value={props.value ?? ''}
      onChange={(e) => props.setValue(e.target.value)}
      error={hasError}
      helperText={hasError ? props.validationErrors[0] : undefined}
      size="small"
      sx={{ width: '100%', maxWidth: INPUT_MAX_WIDTH }}
    />
  );
});

const MuiDateTimeInput = createComponentImplementation(DateTimeInputApi, ({ props }) => {
  let type = 'datetime-local';
  if (props.enableDate && !props.enableTime) type = 'date';
  if (!props.enableDate && props.enableTime) type = 'time';
  return (
    <MuiTextField
      label={props.label}
      type={type}
      value={props.value ?? ''}
      onChange={(e) => props.setValue(e.target.value)}
      InputLabelProps={{ shrink: true }}
      inputProps={{
        min: typeof props.min === 'string' ? props.min : undefined,
        max: typeof props.max === 'string' ? props.max : undefined,
      }}
      size="small"
      sx={{ width: '100%', maxWidth: INPUT_MAX_WIDTH }}
    />
  );
});

function mapJustify(j) {
  switch (j) {
    case 'center': return 'center';
    case 'end': return 'flex-end';
    case 'spaceAround': return 'space-around';
    case 'spaceBetween': return 'space-between';
    case 'spaceEvenly': return 'space-evenly';
    case 'start': return 'flex-start';
    case 'stretch': return 'stretch';
    default: return 'flex-start';
  }
}
function mapAlign(a) {
  switch (a) {
    case 'start': return 'flex-start';
    case 'center': return 'center';
    case 'end': return 'flex-end';
    case 'stretch': return 'stretch';
    default: return 'stretch';
  }
}

/**
 * MUI catalog: same id as basicCatalog so the agent's `catalogId` keeps
 * matching. Inherits unspecified components from basicCatalog so future
 * surfaces using Card/Modal/Slider/etc. still render (with default styling).
 */
const overrides = new Map([
  [MuiText.name, MuiText],
  [MuiColumn.name, MuiColumn],
  [MuiRow.name, MuiRow],
  [MuiButtonImpl.name, MuiButtonImpl],
  [MuiTextFieldImpl.name, MuiTextFieldImpl],
  [MuiDateTimeInput.name, MuiDateTimeInput],
]);

const merged = [];
for (const [name, impl] of basicCatalog.components) {
  merged.push(overrides.get(name) || impl);
}

export const muiCatalog = new Catalog(
  basicCatalog.id,
  merged,
  Array.from(basicCatalog.functions.values()),
);
