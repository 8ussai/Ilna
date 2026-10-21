import { createContext, useContext } from 'react'

// False inside a course the student added from someone else: they can open and read everything
// (and take quizzes), but every upload, rename, delete and add button is hidden. The backend refuses
// those changes either way. CoursePage provides it.
export const CourseCanEditContext = createContext(true)

export function useCourseCanEdit() {
  return useContext(CourseCanEditContext)
}
