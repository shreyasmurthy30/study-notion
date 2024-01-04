// HOW RAZORPAY PAYMENT INTEGRATION WORKS

/*

1) CAPTURE PAYMENT: just gets all details required

2) VERIFY PAYMENT:

Request Data Extraction: The code extracts several pieces of information from the request body using optional chaining (?.). These extracted values are:

    razorpay_order_id: The ID of the Razorpay order associated with the payment.
    razorpay_payment_id: The ID of the payment transaction.
    razorpay_signature: The digital signature sent by Razorpay to verify the authenticity of the payment.
    courses: Information about the courses being purchased.
    userId: The ID of the user initiating the payment.

    3)NOW SIGNATURE VERIFICATION:
    WHAT IS A SIGNATURE? 

      The razorpay_signature is used for verifying the authenticity and integrity of data related to a payment
      transaction when using the Razorpay payment gateway. In a payment flow, after a user completes a payment
      on the Razorpay checkout page, Razorpay sends back various pieces of information related to the payment 
      to the merchant's server. This information includes the razorpay_order_id, razorpay_payment_id, and other relevant details.

      The purpose of the razorpay_signature is to ensure that the data received by the merchant's server has
      not been tampered with and that it indeed originated from Razorpay. It acts as a cryptographic signature
      or checksum that can be verified by the merchant's server to confirm the authenticity of the data.

    Here's how it works:

    1) The merchant's server receives the razorpay_signature as part of the data sent by Razorpay after a payment.
    B) The server then calculates its own version of the signature based on the received razorpay_order_id and razorpay_payment_id,
       along with a secret key known only to the merchant (stored in process.env.RAZORPAY_SECRET).
    C) By comparing the calculated signature with the received razorpay_signature, the server can determine if 
       the payment data has been altered or if it matches the data sent by Razorpay. If the calculated signature 
       matches the received one, it indicates that the payment data is genuine and has not been tampered with.
    D) If the signatures match, the merchant's server can proceed with processing the payment and performing any necessary actions, 
       such as fulfilling orders, enrolling users, etc.

      In essence, the razorpay_signature serves as a security mechanism to ensure the integrity of payment data and prevent malicious
      actors from tampering with payment information during the communication between Razorpay and the merchant's server.

4) Signature Verification: If all the required data is present, the code constructs a string called body by concatenating the
   razorpay_order_id and razorpay_payment_id values with a pipe (|) separator. It then uses the crypto module to create a hash-based
   message authentication code (HMAC) using the SHA-256 hashing algorithm and a secret key (process.env.RAZORPAY_SECRET). This HMAC is
   compared with the received razorpay_signature.

5) Enrollment and Response: If the calculated HMAC matches the received razorpay_signature, it means that the payment is legitimate
   and the code proceeds to call an enrollStudents function. This function is called with the 
   courses, userId, and res objects. This function handles the process of enrolling the user in the purchased courses.


*/


const { instance } = require("../config/razorpay")
const Course = require("../models/Course")
const crypto = require("crypto")
const User = require("../models/User")
const mailSender = require("../utils/mailSender")
const mongoose = require("mongoose")
const {
  courseEnrollmentEmail,
} = require("../mail/templates/courseEnrollmentEmail")
const { paymentSuccessEmail } = require("../mail/templates/paymentSuccessEmail")
const CourseProgress = require("../models/CourseProgress")

// Capture the payment and initiate the Razorpay order
exports.capturePayment = async (req, res) => {
  // get courseid and userid
  // as multiple courses we use {}
  const { courses } = req.body
  const userId = req.user.id
  if (courses.length === 0) {
    return res.json({ success: false, message: "Please Provide Course ID" })
  }

  let total_amount = 0
  // as user might purchase multiple courses 
  for (const course_id of courses) {
    let course
    try {
      // Find the course by its ID
      course = await Course.findById(course_id)

      // If the course is not found, return an error
      if (!course) {
        return res
          .status(200)
          .json({ success: false, message: "Could not find the Course" })
      }

      // Check if the user is already enrolled in the course
      const uid = new mongoose.Types.ObjectId(userId)
      if (course.studentsEnroled.includes(uid)) {
        return res
          .status(200)
          .json({ success: false, message: "Student is already Enrolled" })
      }

      // Add the price of the course to the total amount
      total_amount += course.price
    } catch (error) {
      console.log(error)
      return res.status(500).json({ success: false, message: error.message })
    }
  }

  const options = {
    amount: total_amount * 100,
    currency: "INR",
    receipt: Math.random(Date.now()).toString(),
  }

  try {
    // Initiate the payment using Razorpay
    // from documentation
     const paymentResponse = await instance.orders.create(options)
    console.log(paymentResponse)
    res.json({
      success: true,
      data: paymentResponse,
    })
  } catch (error) {
    console.log(error)
    res
      .status(500)
      .json({ success: false, message: "Could not initiate order." })
  }
}

// verify the payment
exports.verifyPayment = async (req, res) => {
  // The ID of the Razorpay order associated with the payment.
  const razorpay_order_id = req.body?.razorpay_order_id
  // The ID of the payment transaction
  const razorpay_payment_id = req.body?.razorpay_payment_id
  // The digital signature sent by Razorpay to verify the authenticity of the payment
  const razorpay_signature = req.body?.razorpay_signature 

  const courses = req.body?.courses
  const userId = req.user.id

  if (
    !razorpay_order_id ||
    !razorpay_payment_id ||
    !razorpay_signature ||
    !courses ||
    !userId
  ) {
    return res.status(200).json({ success: false, message: "Payment Failed" })
  }

  let body = razorpay_order_id + "|" + razorpay_payment_id

  const expectedSignature = crypto
    .createHmac("sha256", process.env.RAZORPAY_SECRET)
    .update(body.toString())
    .digest("hex")

  if (expectedSignature === razorpay_signature) {
    await enrollStudents(courses, userId, res)
    return res.status(200).json({ success: true, message: "Payment Verified" })
  }

  return res.status(200).json({ success: false, message: "Payment Failed" })
}

// Send Payment Success Email
exports.sendPaymentSuccessEmail = async (req, res) => {
  const { orderId, paymentId, amount } = req.body

  const userId = req.user.id

  if (!orderId || !paymentId || !amount || !userId) {
    return res
      .status(400)
      .json({ success: false, message: "Please provide all the details" })
  }

  try {
    const enrolledStudent = await User.findById(userId)

    await mailSender(
      enrolledStudent.email,
      `Payment Received`,
      paymentSuccessEmail(
        `${enrolledStudent.firstName} ${enrolledStudent.lastName}`,
        amount / 100,
        orderId,
        paymentId
      )
    )
  } catch (error) {
    console.log("error in sending mail", error)
    return res
      .status(400)
      .json({ success: false, message: "Could not send email" })
  }
}

// enroll the student in the courses
const enrollStudents = async (courses, userId, res) => {
  if (!courses || !userId) {
    return res
      .status(400)
      .json({ success: false, message: "Please Provide Course ID and User ID" })
  }

  for (const courseId of courses) {
    try {
      // Find the course and enroll the student in it
      const enrolledCourse = await Course.findOneAndUpdate(
        { _id: courseId },
        { $push: { studentsEnroled: userId } },
        { new: true }
      )

      if (!enrolledCourse) {
        return res
          .status(500)
          .json({ success: false, error: "Course not found" })
      }
      console.log("Updated course: ", enrolledCourse)

      const courseProgress = await CourseProgress.create({
        courseID: courseId,
        userId: userId,
        completedVideos: [],
      })
      // Find the student and add the course to their list of enrolled courses
      const enrolledStudent = await User.findByIdAndUpdate(
        userId,
        {
          $push: {
            courses: courseId,
            courseProgress: courseProgress._id,
          },
        },
        { new: true }
      )

      console.log("Enrolled student: ", enrolledStudent)
      // Send an email notification to the enrolled student
      const emailResponse = await mailSender(
        enrolledStudent.email,
        `Successfully Enrolled into ${enrolledCourse.courseName}`,
        courseEnrollmentEmail(
          enrolledCourse.courseName,
          `${enrolledStudent.firstName} ${enrolledStudent.lastName}`
        )
      )

      console.log("Email sent successfully: ", emailResponse.response)
    } catch (error) {
      console.log(error)
      return res.status(400).json({ success: false, error: error.message })
    }
  }
}