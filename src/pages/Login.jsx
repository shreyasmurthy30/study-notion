import loginImg from "../assets/Images/login.webp"
import Lottie from "lottie-react"
import anidata from "../assets/Images/Animation - 1704346062807.json"
import Template from "../components/core/Auth/Template"

function Login() {
  return (
    <div className="bg-black">
        <Template
        title="Welcome Back"
        description1="Build skills for today, tomorrow, and beyond."
        description2="Education to future-proof your career."
        image={loginImg}
        formType="login"
      />
    </div>
  )
}
export default Login
