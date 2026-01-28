import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'

/**
 * Basit bir test - Test sisteminin çalışıp çalışmadığını doğrular.
 */
describe('Test Setup', () => {
    it('should work', () => {
        expect(1 + 1).toBe(2)
    })

    it('should render a simple component', () => {
        render(<div data-testid="test">Hello</div>)
        expect(screen.getByTestId('test')).toHaveTextContent('Hello')
    })
})
