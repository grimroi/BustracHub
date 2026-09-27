// src/components/__tests__/ThemeToggle.test.js
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeToggle } from '../ThemeToggle'; // Suportado ang parehong Named o Default Export

describe('ThemeToggle Component', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  test('dapat mag-render ng button at baguhin ang theme sa pagpindot', () => {
    render(<ThemeToggle />);

    const toggleBtn = screen.getByRole('button');
    expect(toggleBtn).toBeInTheDocument();

    fireEvent.click(toggleBtn);

    const themeInStorage = localStorage.getItem('theme');
    expect(themeInStorage).toBeTruthy();
  });
});